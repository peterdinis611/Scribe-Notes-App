//! Extra store APIs used by MCP (and reusable from Tauri later).

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::db::{
    extract_search_text, sync_document_fts, sync_document_links,
};
use crate::nlp::NlpSidecar;
use crate::store::{
    require_nlp, search_library, sync_sidecar_backend, IdTitle, ScribeStore,
};
use crate::db::SearchMode;

const META_DOCUMENTS_DIR: &str = "documents_dir";
const BACKUP_FILE_PREFIX: &str = "scribe-backup-";
const BACKUP_FILE_SUFFIX: &str = ".zip";
const AUTO_BACKUP_KEEP: usize = 14;

fn default_documents_dir() -> PathBuf {
    dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Scribe")
}

fn default_auto_backup_dir() -> PathBuf {
    default_documents_dir().join("Backups")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomTemplateSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub title: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentAsset {
    pub path: String,
    pub file_name: String,
    pub extension: String,
    pub kind: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub modified_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExportResult {
    pub path: String,
    pub documents_included: u32,
}

impl ScribeStore {
    fn document_title_and_text(&self, document_id: &str) -> Result<(String, String), String> {
        let (title, content_json): (String, String) = self
            .db
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        let text = format!("{title}\n{}", extract_search_text(&content_json));
        Ok((title, text))
    }

    pub fn documents_dir(&self) -> Result<PathBuf, String> {
        let stored: Option<String> = self
            .db
            .query_row(
                "SELECT value FROM meta WHERE key = ?1",
                [META_DOCUMENTS_DIR],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let dir = stored
            .map(PathBuf::from)
            .unwrap_or_else(default_documents_dir);
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(dir)
    }

    pub fn library_answer(
        &self,
        sidecar: &NlpSidecar,
        question: &str,
        limit: Option<i64>,
    ) -> Result<Value, String> {
        let trimmed = question.trim();
        if trimmed.is_empty() {
            return Err("question is required".to_string());
        }
        require_nlp(&self.db)?;
        if !sidecar.script_exists() {
            return Err("NLP sidecar unavailable".to_string());
        }
        let limit = limit.unwrap_or(6).clamp(1, 20);
        sync_sidecar_backend(sidecar, &self.db)?;

        let hits = search_library(&self.db, sidecar, trimmed, limit, SearchMode::Hybrid)?;
        let passages = json!(hits
            .iter()
            .map(|hit| {
                json!({
                    "documentId": hit.document_id,
                    "title": hit.title,
                    "snippet": hit.snippet,
                })
            })
            .collect::<Vec<_>>());

        let result = sidecar.library_answer(trimmed, passages, 4)?;
        let citations = result
            .get("citations")
            .cloned()
            .unwrap_or_else(|| {
                json!(hits
                    .iter()
                    .map(|hit| {
                        json!({
                            "documentId": hit.document_id,
                            "title": hit.title,
                            "snippet": hit.snippet,
                        })
                    })
                    .collect::<Vec<_>>())
            });

        Ok(json!({
            "answer": result.get("answer").and_then(|v| v.as_str()).unwrap_or(
                "Based on your notes: No matching passages were found in your indexed library."
            ),
            "citations": citations,
            "hitCount": hits.len(),
        }))
    }

    pub fn document_analysis(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
    ) -> Result<Value, String> {
        require_nlp(&self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        sidecar.analyze_document(&text, 12, 24, 3)
    }

    pub fn suggest_document_title(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
    ) -> Result<Value, String> {
        require_nlp(&self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        sidecar.suggest_title(&text, 72)
    }

    pub fn find_duplicate_documents(
        &self,
        sidecar: &NlpSidecar,
        limit: Option<i64>,
    ) -> Result<Value, String> {
        require_nlp(&self.db)?;
        let mut stmt = self
            .db
            .prepare(
                "SELECT id, title, content_json FROM documents
                 WHERE deleted_at IS NULL
                 ORDER BY updated_at DESC
                 LIMIT 80",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut documents = Vec::new();
        for row in rows {
            let (id, title, content_json) = row.map_err(|e| e.to_string())?;
            documents.push(json!({
                "id": id,
                "title": title,
                "text": extract_search_text(&content_json),
            }));
        }
        sync_sidecar_backend(sidecar, &self.db)?;
        sidecar.find_duplicates(json!(documents), limit.unwrap_or(20), 0.72)
    }

    pub fn suggest_wiki_links(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
        limit: Option<i64>,
    ) -> Result<Value, String> {
        require_nlp(&self.db)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;

        let mut stmt = self
            .db
            .prepare(
                "SELECT id, title FROM documents
                 WHERE deleted_at IS NULL AND id != ?1
                 ORDER BY updated_at DESC
                 LIMIT 800",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![document_id], |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "title": row.get::<_, String>(1)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        let documents = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        sidecar.suggest_wiki_links(
            &text,
            json!(documents),
            limit.unwrap_or(8),
            Some(document_id),
        )
    }

    pub fn calendar_events(
        &self,
        sidecar: &NlpSidecar,
        limit: Option<i64>,
        from_date: Option<&str>,
        to_date: Option<&str>,
    ) -> Result<Value, String> {
        require_nlp(&self.db)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        let max_docs = limit.unwrap_or(80).clamp(1, 200);

        let mut stmt = self
            .db
            .prepare(
                "SELECT id, title, content_json FROM documents
                 WHERE deleted_at IS NULL
                 ORDER BY updated_at DESC
                 LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![max_docs], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut docs = Vec::new();
        for row in rows {
            let (id, title, content_json) = row.map_err(|e| e.to_string())?;
            if content_json.contains("\"type\":\"scribe-vault-v1\"") {
                continue;
            }
            let text = extract_search_text(&content_json);
            if text.trim().is_empty() && title.trim().is_empty() {
                continue;
            }
            docs.push(json!({
                "id": id,
                "title": title,
                "text": text.chars().take(8_000).collect::<String>(),
            }));
        }

        let result = sidecar.extract_dates_batch(json!(docs), 10)?;
        let from = from_date.map(str::trim).filter(|v| !v.is_empty());
        let to = to_date.map(str::trim).filter(|v| !v.is_empty());

        let events = result
            .get("events")
            .and_then(|value| value.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter(|item| {
                        let day = item
                            .get("resolvedDate")
                            .and_then(|value| value.as_str());
                        if let (Some(from), Some(day)) = (from, day) {
                            if day < from {
                                return false;
                            }
                        }
                        if let (Some(to), Some(day)) = (to, day) {
                            if day > to {
                                return false;
                            }
                        }
                        true
                    })
                    .cloned()
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        Ok(json!({ "count": events.len(), "events": events }))
    }

    pub fn spellcheck_document(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
    ) -> Result<Value, String> {
        require_nlp(&self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        sidecar.spellcheck(&text, None, 80)
    }

    pub fn extract_document_keywords(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
        limit: Option<i64>,
    ) -> Result<Value, String> {
        require_nlp(&self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        sidecar.extract_keywords(&text, limit.unwrap_or(12).clamp(1, 40))
    }

    pub fn analyze_document_sentiment(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
    ) -> Result<Value, String> {
        require_nlp(&self.db)?;
        let (_title, text) = self.document_title_and_text(document_id)?;
        sync_sidecar_backend(sidecar, &self.db)?;
        sidecar.analyze_sentiment(&text)
    }

    pub fn list_custom_templates(&self) -> Result<Vec<CustomTemplateSummary>, String> {
        let mut stmt = self
            .db
            .prepare(
                "SELECT id, name, description, category, title, created_at
                 FROM custom_templates
                 ORDER BY name COLLATE NOCASE ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(CustomTemplateSummary {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    category: row.get(3)?,
                    title: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn create_note_from_template(
        &self,
        template_id: &str,
        folder_id: Option<&str>,
        title_override: Option<&str>,
    ) -> Result<IdTitle, String> {
        let row: Option<(String, String, String)> = self
            .db
            .query_row(
                "SELECT name, title, content_json FROM custom_templates WHERE id = ?1",
                params![template_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let Some((_name, template_title, content_json)) = row else {
            return Err(format!("Template not found: {template_id}"));
        };

        let title = title_override
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or(template_title.trim());
        if title.is_empty() {
            return Err("title is required".to_string());
        }

        let content_json = if content_json.trim().is_empty() {
            r#"{"type":"doc","content":[{"type":"paragraph"}]}"#.to_string()
        } else {
            content_json
        };
        let folder_id = folder_id.map(str::to_string);

        self.run_writable(|db| {
            let id = Uuid::new_v4().to_string();
            let now = Self::now_ms();
            db.execute(
                "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5)",
                params![id, title, content_json, folder_id, now],
            )
            .map_err(|e| e.to_string())?;
            sync_document_fts(db, &id, title, &content_json)?;
            sync_document_links(db, &id, &content_json)?;
            Ok(IdTitle {
                id,
                title: title.to_string(),
            })
        })
    }

    pub fn list_document_assets(&self, document_id: &str) -> Result<Vec<DocumentAsset>, String> {
        let exists: bool = self
            .db
            .query_row(
                "SELECT 1 FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |_| Ok(true),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .unwrap_or(false);
        if !exists {
            return Err(format!("Document not found: {document_id}"));
        }

        let assets_dir = self.documents_dir()?.join("assets").join(document_id);
        if !assets_dir.is_dir() {
            return Ok(Vec::new());
        }

        let mut assets = Vec::new();
        for entry in fs::read_dir(&assets_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            let kind = match extension.as_str() {
                "svg" => "svg",
                "json" | "lottie" => "lottie",
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "avif" => "image",
                _ => "other",
            };
            let size_bytes = entry
                .metadata()
                .map(|m| m.len())
                .unwrap_or(0);
            assets.push(DocumentAsset {
                path: path.to_string_lossy().to_string(),
                file_name,
                extension,
                kind: kind.to_string(),
                size_bytes,
            });
        }
        assets.sort_by(|a, b| a.file_name.cmp(&b.file_name));
        Ok(assets)
    }

    pub fn list_backups(&self, directory: Option<&str>) -> Result<Vec<BackupInfo>, String> {
        let dir = resolve_backup_dir(directory)?;
        if !dir.is_dir() {
            return Ok(Vec::new());
        }

        let mut backups = Vec::new();
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !path.is_file() || !is_auto_backup_zip(name) {
                continue;
            }
            let meta = entry.metadata().ok();
            let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified_at = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64);
            backups.push(BackupInfo {
                path: path.to_string_lossy().to_string(),
                file_name: name.to_string(),
                size_bytes,
                modified_at,
            });
        }
        backups.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
        Ok(backups)
    }

    pub fn create_backup(
        &self,
        db_path: &Path,
        directory: Option<&str>,
    ) -> Result<BackupExportResult, String> {
        let dir = resolve_backup_dir(directory)?;
        fs::create_dir_all(&dir).map_err(|e| format!("Could not create backup folder: {e}"))?;

        self.db
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| e.to_string())?;

        let schema_version: i32 = self
            .db
            .query_row(
                "SELECT value FROM meta WHERE key = 'schema_version'",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);

        let documents_dir = self.documents_dir()?;
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let out_path = dir.join(format!("{BACKUP_FILE_PREFIX}{stamp}{BACKUP_FILE_SUFFIX}"));

        let result = write_library_archive(&out_path, db_path, &documents_dir, schema_version)?;
        let _ = prune_old_auto_backups(&dir, AUTO_BACKUP_KEEP);
        Ok(result)
    }
}

fn is_auto_backup_zip(name: &str) -> bool {
    name.starts_with(BACKUP_FILE_PREFIX) && name.ends_with(BACKUP_FILE_SUFFIX)
}

fn resolve_backup_dir(directory: Option<&str>) -> Result<PathBuf, String> {
    let trimmed = directory.map(str::trim).unwrap_or("");
    let dir = if trimmed.is_empty() {
        default_auto_backup_dir()
    } else {
        PathBuf::from(trimmed)
    };
    Ok(dir)
}

fn prune_old_auto_backups(dir: &Path, keep: usize) -> Result<u32, String> {
    if keep == 0 || !dir.is_dir() {
        return Ok(0);
    }
    let mut archives: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !path.is_file() || !is_auto_backup_zip(name) {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        archives.push((path, modified));
    }
    archives.sort_by(|a, b| b.1.cmp(&a.1));
    let mut removed = 0u32;
    for (path, _) in archives.into_iter().skip(keep) {
        if fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

fn write_library_archive(
    out_path: &Path,
    db_path: &Path,
    documents_dir: &Path,
    schema_version: i32,
) -> Result<BackupExportResult, String> {
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let file = File::create(out_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let manifest = json!({
        "version": env!("CARGO_PKG_VERSION"),
        "schemaVersion": schema_version,
        "createdAt": chrono::Utc::now().timestamp(),
        "documentsDir": documents_dir.to_string_lossy(),
    });
    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    zip.start_file("manifest.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|e| e.to_string())?;

    zip.start_file("scribe.db", options)
        .map_err(|e| e.to_string())?;
    let mut db_file = File::open(db_path).map_err(|e| e.to_string())?;
    let mut db_bytes = Vec::new();
    db_file.read_to_end(&mut db_bytes).map_err(|e| e.to_string())?;
    zip.write_all(&db_bytes).map_err(|e| e.to_string())?;

    let documents_included = add_dir_to_zip(&mut zip, documents_dir, "documents/", options)?;
    zip.finish().map_err(|e| e.to_string())?;

    Ok(BackupExportResult {
        path: out_path.to_string_lossy().to_string(),
        documents_included,
    })
}

fn add_dir_to_zip(
    zip: &mut ZipWriter<File>,
    base: &Path,
    prefix: &str,
    options: SimpleFileOptions,
) -> Result<u32, String> {
    let mut count = 0u32;
    if !base.exists() {
        return Ok(0);
    }
    let mut stack = vec![base.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let rel = path
                .strip_prefix(base)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            zip.start_file(format!("{prefix}{rel}"), options)
                .map_err(|e| e.to_string())?;
            let mut file = File::open(&path).map_err(|e| e.to_string())?;
            let mut buffer = Vec::new();
            file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
            zip.write_all(&buffer).map_err(|e| e.to_string())?;
            count += 1;
        }
    }
    Ok(count)
}
