use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use regex::Regex;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::db::migrations;
use crate::db::{
    fuse_search_hits, search_documents_in_conn, SearchHit, SearchMode,
};
use crate::db::{
    count_embeddings, count_stale_embeddings, dominant_embedding_model, extract_search_text,
    get_document_embedding, get_embed_backend, is_nlp_enabled, remove_document_fts,
    save_artifact, save_revision, semantic_search, similar_documents, sync_document_fts,
    sync_document_links, upsert_embedding,
};
use crate::nlp::{script_path_label, NlpSidecar};
use crate::path::default_db_path;
use crate::plain_text::{plain_text_to_paragraph_nodes, plain_text_to_tiptap, tiptap_to_plain_text};
use crate::tasks::{
    append_phrase_tasks, extract_checkbox_tasks, merge_document_tasks, DocumentTask,
};

const SUMMARY_SELECT: &str =
    "SELECT id, title, folder_id, file_path, updated_at, is_favorite, is_pinned, tags, deleted_at FROM documents";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
    pub file_path: Option<String>,
    pub updated_at: i64,
    pub is_favorite: bool,
    pub is_pinned: bool,
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentRow {
    pub id: String,
    pub thread_id: String,
    pub document_id: String,
    pub author: String,
    pub body: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentThreadRow {
    pub id: String,
    pub document_id: String,
    pub quote: String,
    pub resolved: bool,
    pub created_at: i64,
    pub comments: Vec<CommentRow>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentSearchHit {
    pub comment_id: String,
    pub thread_id: String,
    pub document_id: String,
    pub document_title: String,
    pub author: String,
    pub body: String,
    pub quote: String,
    pub resolved: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub tag: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRevisionSummary {
    pub id: String,
    pub document_id: String,
    pub title: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRevisionDetail {
    pub id: String,
    pub document_id: String,
    pub title: String,
    pub created_at: i64,
    pub plain_text: String,
    pub content_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentDetail {
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
    pub updated_at: i64,
    pub created_at: i64,
    pub tags: Vec<String>,
    pub plain_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_json: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderRow {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub is_pinned: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderDetail {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub is_pinned: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkEdge {
    pub source_id: String,
    pub target_id: String,
    pub source_title: String,
    pub target_title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrphanDocument {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkGraph {
    pub edges: Vec<LinkEdge>,
    pub orphans: Vec<OrphanDocument>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdTitle {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdTags {
    pub id: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveDocumentResult {
    pub document_id: String,
    pub folder_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurgeResult {
    pub id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalSummary {
    pub summary: String,
    pub bullets: Vec<String>,
    pub document_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpEntity {
    pub text: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagSuggestions {
    pub entities: Vec<NlpEntity>,
    pub tag_suggestions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryReport {
    pub markdown: String,
    pub stats: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexResult {
    pub indexed: i64,
    pub model: String,
}

pub struct JournalSummaryInput {
    pub from_date: String,
    pub to_date: String,
    pub journal_folder_id: Option<String>,
    pub document_ids: Option<Vec<String>>,
}

pub struct ScribeStore {
    db: Connection,
    writable: bool,
}

pub struct OpenStoreResult {
    pub store: ScribeStore,
    pub writable: bool,
    pub db_path: PathBuf,
}

impl ScribeStore {
    pub fn is_writable(&self) -> bool {
        self.writable
    }

    pub fn close(self) {}

    fn require_writable(&self) -> Result<(), String> {
        if !self.writable {
            return Err(
                "Database is open read-only. Close Scribe (or retry) so MCP can open a writable connection, or unset SCRIBE_MCP_WRITE=0.".to_string(),
            );
        }
        Ok(())
    }

    fn run_writable<T, F>(&self, operation: F) -> Result<T, String>
    where
        F: FnOnce(&Connection) -> Result<T, String>,
    {
        self.require_writable()?;
        match operation(&self.db) {
            Ok(value) => Ok(value),
            Err(message) => {
                if message.contains("locked") || message.contains("busy") {
                    Err(format!(
                        "Scribe database is locked (app may be open). Retry in a moment. ({message})"
                    ))
                } else {
                    Err(message)
                }
            }
        }
    }

    fn now_ms() -> i64 {
        chrono::Utc::now().timestamp_millis()
    }

    fn parse_tags(raw: Option<String>) -> Vec<String> {
        let Some(raw) = raw.filter(|value| !value.is_empty()) else {
            return Vec::new();
        };
        if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
            if let Some(array) = parsed.as_array() {
                return array
                    .iter()
                    .filter_map(|item| item.as_str().map(str::to_string))
                    .collect();
            }
        }
        raw.split(',')
            .map(str::trim)
            .filter(|tag| !tag.is_empty())
            .map(str::to_string)
            .collect()
    }

    fn normalize_tags(tags: &[String]) -> Vec<String> {
        let mut cleaned: Vec<String> = tags
            .iter()
            .map(|tag| tag.trim().to_string())
            .filter(|tag| !tag.is_empty())
            .collect();
        cleaned.sort();
        cleaned.dedup();
        cleaned
    }

    fn encode_tags(tags: &[String]) -> String {
        serde_json::to_string(&Self::normalize_tags(tags)).unwrap_or_else(|_| "[]".to_string())
    }

    fn map_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<DocumentSummary> {
        let deleted_at: Option<i64> = row.get(8)?;
        Ok(DocumentSummary {
            id: row.get(0)?,
            title: row.get(1)?,
            folder_id: row.get(2)?,
            file_path: row.get(3)?,
            updated_at: row.get(4)?,
            is_favorite: row.get::<_, i64>(5)? != 0,
            is_pinned: row.get::<_, i64>(6)? != 0,
            tags: Self::parse_tags(row.get(7)?),
            deleted_at,
        })
    }

    fn collect_wiki_labels(text: &str) -> Vec<String> {
        static WIKI: OnceLock<Regex> = OnceLock::new();
        let pattern = WIKI.get_or_init(|| Regex::new(r"\[\[([^\]]+)\]\]").expect("wiki regex"));
        pattern
            .captures_iter(text)
            .filter_map(|cap| cap.get(1).map(|item| item.as_str().trim().to_string()))
            .filter(|label| !label.is_empty())
            .collect()
    }

    fn resolve_wiki_target(&self, label: &str) -> Option<String> {
        let docs = self.find_documents_by_title(label, 5).unwrap_or_default();
        docs.into_iter()
            .find(|doc| doc.title.eq_ignore_ascii_case(label))
            .map(|doc| doc.id)
    }

    fn resolve_wiki_labels(&self, text: &str) -> HashMap<String, Option<String>> {
        let mut map = HashMap::new();
        for label in Self::collect_wiki_labels(text) {
            map.entry(label.clone())
                .or_insert_with(|| self.resolve_wiki_target(&label));
        }
        map
    }

    fn wiki_resolver_from_map(
        map: &HashMap<String, Option<String>>,
    ) -> impl Fn(&str) -> Option<String> + '_ {
        move |label: &str| map.get(label).cloned().flatten()
    }

    pub fn create_note(
        &self,
        title: &str,
        content: Option<&str>,
        folder_id: Option<&str>,
    ) -> Result<IdTitle, String> {
        let title = title.trim();
        if title.is_empty() {
            return Err("title is required".to_string());
        }

        let body = content.unwrap_or("");
        let wiki_map: &'static HashMap<String, Option<String>> =
            Box::leak(Box::new(self.resolve_wiki_labels(body)));
        let resolver = Self::wiki_resolver_from_map(wiki_map);
        let content_json = plain_text_to_tiptap(body, Some(&resolver));
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

    pub fn append_to_note(&self, id: &str, text: &str) -> Result<IdTitle, String> {
        let id = id.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }
        if text.is_empty() {
            return Err("text is required".to_string());
        }

        let wiki_map: &'static HashMap<String, Option<String>> =
            Box::leak(Box::new(self.resolve_wiki_labels(text)));
        let resolver = Self::wiki_resolver_from_map(wiki_map);
        let new_nodes = plain_text_to_paragraph_nodes(text, Some(&resolver));

        self.run_writable(|db| {
            let row: Option<(String, String, Option<i64>)> = db
                .query_row(
                    "SELECT title, content_json, deleted_at FROM documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((title, content_json, deleted_at)) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document not found: {id}"));
            }

            let mut doc: Value = serde_json::from_str(&content_json).unwrap_or_else(|_| {
                json!({ "type": "doc", "content": [] })
            });
            if !doc.get("content").and_then(|value| value.as_array()).is_some() {
                doc["content"] = json!([]);
            }
            if doc.get("type").and_then(|value| value.as_str()).is_none() {
                doc["type"] = json!("doc");
            }

            if let Some(content) = doc.get_mut("content").and_then(|value| value.as_array_mut()) {
                content.extend(new_nodes);
            }

            let content_json = serde_json::to_string(&doc).unwrap_or(content_json);
            let now = Self::now_ms();
            db.execute(
                "UPDATE documents SET content_json = ?1, updated_at = ?2 WHERE id = ?3",
                params![content_json, now, id],
            )
            .map_err(|e| e.to_string())?;
            sync_document_fts(db, id, &title, &content_json)?;
            sync_document_links(db, id, &content_json)?;

            Ok(IdTitle {
                id: id.to_string(),
                title,
            })
        })
    }

    pub fn search_documents_fts(&self, query: &str, limit: i64) -> Result<Vec<SearchHit>, String> {
        let hits = search_documents_in_conn(&self.db, query, limit)?;
        Ok(hits
            .into_iter()
            .map(|mut hit| {
                hit.match_kind = Some("fts".to_string());
                hit
            })
            .collect())
    }

    pub fn search_documents(
        &self,
        sidecar: &NlpSidecar,
        query: &str,
        limit: i64,
    ) -> Result<Vec<SearchHit>, String> {
        let mode = if is_nlp_enabled(&self.db)? {
            SearchMode::Hybrid
        } else {
            SearchMode::Fts
        };
        search_library(&self.db, sidecar, query, limit, mode)
    }

    pub fn list_documents(
        &self,
        folder_id: Option<&str>,
        limit: Option<i64>,
    ) -> Result<Vec<DocumentSummary>, String> {
        let limit = limit.unwrap_or(50).clamp(1, 200);
        let filter_folder = folder_id.filter(|value| !value.is_empty());
        let mut stmt = if filter_folder.is_some() {
            self.db
                .prepare(&format!(
                    "{SUMMARY_SELECT} WHERE deleted_at IS NULL AND folder_id = ?1 ORDER BY updated_at DESC LIMIT ?2"
                ))
                .map_err(|e| e.to_string())?
        } else {
            self.db
                .prepare(&format!(
                    "{SUMMARY_SELECT} WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?1"
                ))
                .map_err(|e| e.to_string())?
        };

        let rows = if let Some(folder_id) = filter_folder {
            stmt.query_map(params![folder_id, limit], Self::map_summary)
        } else {
            stmt.query_map(params![limit], Self::map_summary)
        }
        .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn find_documents_by_title(
        &self,
        title_query: &str,
        limit: i64,
    ) -> Result<Vec<DocumentSummary>, String> {
        let q = title_query.trim();
        if q.is_empty() {
            return Ok(Vec::new());
        }
        let max = limit.clamp(1, 50);
        let pattern = format!("%{q}%");
        let prefix = format!("{q}%");

        let mut stmt = self
            .db
            .prepare(&format!(
                "{SUMMARY_SELECT}
                 WHERE deleted_at IS NULL AND title LIKE ?1 COLLATE NOCASE
                 ORDER BY
                   CASE WHEN title = ?2 COLLATE NOCASE THEN 0
                        WHEN title LIKE ?3 COLLATE NOCASE THEN 1
                        ELSE 2 END,
                   updated_at DESC
                 LIMIT ?4"
            ))
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![pattern, q, prefix, max], Self::map_summary)
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn get_document(
        &self,
        id: &str,
        include_json: bool,
    ) -> Result<Option<DocumentDetail>, String> {
        let row = self
            .db
            .query_row(
                "SELECT id, title, content_json, folder_id, created_at, updated_at, tags, deleted_at
                 FROM documents WHERE id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, i64>(4)?,
                        row.get::<_, i64>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<i64>>(7)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let Some((
            id,
            title,
            content_json,
            folder_id,
            created_at,
            updated_at,
            tags_raw,
            deleted_at,
        )) = row
        else {
            return Ok(None);
        };
        if deleted_at.is_some() {
            return Ok(None);
        }

        Ok(Some(DocumentDetail {
            id,
            title,
            folder_id,
            created_at,
            updated_at,
            tags: Self::parse_tags(tags_raw),
            plain_text: tiptap_to_plain_text(&content_json),
            content_json: if include_json {
                Some(content_json)
            } else {
                None
            },
        }))
    }

    pub fn list_folders(&self) -> Result<Vec<FolderRow>, String> {
        let mut stmt = self
            .db
            .prepare(
                "SELECT id, name, parent_id, is_pinned FROM folders ORDER BY name COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(FolderRow {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    parent_id: row.get(2)?,
                    is_pinned: row.get::<_, i64>(3)? != 0,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn list_backlinks(&self, id: &str) -> Result<Vec<DocumentSummary>, String> {
        let mut stmt = self
            .db
            .prepare(
                "SELECT d.id, d.title, d.folder_id, d.file_path, d.updated_at,
                        d.is_favorite, d.is_pinned, d.tags, d.deleted_at
                 FROM document_links l
                 JOIN documents d ON d.id = l.source_id
                 WHERE l.target_id = ?1 AND d.deleted_at IS NULL
                 ORDER BY d.updated_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![id], Self::map_summary)
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn list_outgoing_links(&self, id: &str) -> Result<Vec<DocumentSummary>, String> {
        let mut stmt = self
            .db
            .prepare(
                "SELECT d.id, d.title, d.folder_id, d.file_path, d.updated_at,
                        d.is_favorite, d.is_pinned, d.tags, d.deleted_at
                 FROM document_links l
                 JOIN documents d ON d.id = l.target_id
                 WHERE l.source_id = ?1 AND d.deleted_at IS NULL
                 ORDER BY d.updated_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![id], Self::map_summary)
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn list_link_graph(&self) -> Result<LinkGraph, String> {
        let mut edge_stmt = self
            .db
            .prepare(
                "SELECT l.source_id, l.target_id, s.title AS source_title, t.title AS target_title
                 FROM document_links l
                 JOIN documents s ON s.id = l.source_id AND s.deleted_at IS NULL
                 JOIN documents t ON t.id = l.target_id AND t.deleted_at IS NULL
                 ORDER BY s.title, t.title",
            )
            .map_err(|e| e.to_string())?;

        let edges = edge_stmt
            .query_map([], |row| {
                Ok(LinkEdge {
                    source_id: row.get(0)?,
                    target_id: row.get(1)?,
                    source_title: row.get(2)?,
                    target_title: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        let mut orphan_stmt = self
            .db
            .prepare(
                "SELECT d.id, d.title FROM documents d
                 WHERE d.deleted_at IS NULL
                   AND d.id NOT IN (SELECT source_id FROM document_links)
                   AND d.id NOT IN (SELECT target_id FROM document_links)
                 ORDER BY d.title COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;

        let orphans = orphan_stmt
            .query_map([], |row| {
                Ok(OrphanDocument {
                    id: row.get(0)?,
                    title: row.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok(LinkGraph { edges, orphans })
    }

    pub fn list_favorites(&self, limit: i64) -> Result<Vec<DocumentSummary>, String> {
        let max = limit.clamp(1, 200);
        let mut stmt = self
            .db
            .prepare(&format!(
                "{SUMMARY_SELECT}
                 WHERE deleted_at IS NULL AND is_favorite = 1
                 ORDER BY updated_at DESC LIMIT ?1"
            ))
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![max], Self::map_summary)
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn list_pinned(&self, limit: i64) -> Result<Vec<DocumentSummary>, String> {
        let max = limit.clamp(1, 200);
        let mut stmt = self
            .db
            .prepare(&format!(
                "{SUMMARY_SELECT}
                 WHERE deleted_at IS NULL AND is_pinned = 1
                 ORDER BY updated_at DESC LIMIT ?1"
            ))
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![max], Self::map_summary)
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn list_trashed_documents(&self, limit: i64) -> Result<Vec<DocumentSummary>, String> {
        let max = limit.clamp(1, 200);
        let mut stmt = self
            .db
            .prepare(&format!(
                "{SUMMARY_SELECT}
                 WHERE deleted_at IS NOT NULL
                 ORDER BY deleted_at DESC LIMIT ?1"
            ))
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![max], Self::map_summary)
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn restore_document(&self, id: &str) -> Result<IdTitle, String> {
        self.run_writable(|db| {
            let row: Option<(String, String, Option<i64>)> = db
                .query_row(
                    "SELECT title, content_json, deleted_at FROM documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((title, content_json, deleted_at)) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_none() {
                return Err(format!("Document is not in trash: {id}"));
            }

            db.execute("UPDATE documents SET deleted_at = NULL WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
            sync_document_fts(db, id, &title, &content_json)?;
            sync_document_links(db, id, &content_json)?;

            Ok(IdTitle {
                id: id.to_string(),
                title,
            })
        })
    }

    pub fn purge_document(&self, id: &str) -> Result<PurgeResult, String> {
        self.run_writable(|db| {
            let exists: Option<String> = db
                .query_row("SELECT id FROM documents WHERE id = ?1", params![id], |row| {
                    row.get(0)
                })
                .optional()
                .map_err(|e| e.to_string())?;

            if exists.is_none() {
                return Err(format!("Document not found: {id}"));
            }

            db.execute("DELETE FROM documents WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
            remove_document_fts(db, id)?;

            Ok(PurgeResult {
                id: id.to_string(),
            })
        })
    }

    pub fn list_tags(&self) -> Result<Vec<TagCount>, String> {
        let mut stmt = self
            .db
            .prepare("SELECT tags FROM documents WHERE deleted_at IS NULL AND tags IS NOT NULL")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| row.get::<_, Option<String>>(0))
            .map_err(|e| e.to_string())?;

        let mut counts: HashMap<String, i64> = HashMap::new();
        for row in rows {
            for tag in Self::parse_tags(row.map_err(|e| e.to_string())?) {
                *counts.entry(tag).or_insert(0) += 1;
            }
        }

        let mut tags: Vec<TagCount> = counts
            .into_iter()
            .map(|(tag, count)| TagCount { tag, count })
            .collect();
        tags.sort_by(|left, right| {
            right
                .count
                .cmp(&left.count)
                .then_with(|| left.tag.cmp(&right.tag))
        });
        Ok(tags)
    }

    pub fn search_by_tag(&self, tag: &str, limit: i64) -> Result<Vec<DocumentSummary>, String> {
        let needle = tag.trim();
        if needle.is_empty() {
            return Ok(Vec::new());
        }
        let max = limit.clamp(1, 200);

        let mut stmt = self
            .db
            .prepare(&format!(
                "{SUMMARY_SELECT}
                 WHERE deleted_at IS NULL
                   AND EXISTS (
                     SELECT 1 FROM json_each(documents.tags)
                     WHERE value = ?1
                   )
                 ORDER BY updated_at DESC
                 LIMIT ?2"
            ))
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![needle, max], Self::map_summary)
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn set_document_tags(&self, id: &str, tags: &[String]) -> Result<IdTags, String> {
        self.run_writable(|db| {
            let row: Option<Option<i64>> = db
                .query_row(
                    "SELECT deleted_at FROM documents WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some(deleted_at) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document not found: {id}"));
            }

            let normalized = Self::normalize_tags(tags);
            db.execute(
                "UPDATE documents SET tags = ?1 WHERE id = ?2",
                params![Self::encode_tags(&normalized), id],
            )
            .map_err(|e| e.to_string())?;

            Ok(IdTags {
                id: id.to_string(),
                tags: normalized,
            })
        })
    }

    pub fn create_folder(
        &self,
        name: &str,
        parent_id: Option<&str>,
    ) -> Result<FolderDetail, String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("name is required".to_string());
        }

        self.run_writable(|db| {
            if let Some(parent_id) = parent_id {
                let parent: Option<String> = db
                    .query_row(
                        "SELECT id FROM folders WHERE id = ?1",
                        params![parent_id],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(|e| e.to_string())?;
                if parent.is_none() {
                    return Err(format!("Parent folder not found: {parent_id}"));
                }
            }

            let id = Uuid::new_v4().to_string();
            let now = Self::now_ms();
            let parent_id = parent_id.map(str::to_string);
            db.execute(
                "INSERT INTO folders (id, name, parent_id, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?4)",
                params![id, name, parent_id, now],
            )
            .map_err(|e| e.to_string())?;

            Ok(FolderDetail {
                id,
                name: name.to_string(),
                parent_id,
                is_pinned: false,
                created_at: now,
                updated_at: now,
            })
        })
    }

    pub fn rename_folder(&self, id: &str, name: &str) -> Result<FolderDetail, String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("name is required".to_string());
        }

        self.run_writable(|db| {
            let now = Self::now_ms();
            let updated = db
                .execute(
                    "UPDATE folders SET name = ?1, updated_at = ?2 WHERE id = ?3",
                    params![name, now, id],
                )
                .map_err(|e| e.to_string())?;
            if updated == 0 {
                return Err(format!("Folder not found: {id}"));
            }

            db.query_row(
                "SELECT id, name, parent_id, created_at, updated_at, is_pinned FROM folders WHERE id = ?1",
                params![id],
                |row| {
                    Ok(FolderDetail {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        parent_id: row.get(2)?,
                        created_at: row.get(3)?,
                        updated_at: row.get(4)?,
                        is_pinned: row.get::<_, i64>(5)? != 0,
                    })
                },
            )
            .map_err(|e| e.to_string())
        })
    }

    pub fn move_document_to_folder(
        &self,
        document_id: &str,
        folder_id: Option<&str>,
    ) -> Result<MoveDocumentResult, String> {
        self.run_writable(|db| {
            let doc: Option<Option<i64>> = db
                .query_row(
                    "SELECT deleted_at FROM documents WHERE id = ?1",
                    params![document_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some(deleted_at) = doc else {
                return Err(format!("Document not found: {document_id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document not found: {document_id}"));
            }

            if let Some(folder_id) = folder_id {
                let folder: Option<String> = db
                    .query_row(
                        "SELECT id FROM folders WHERE id = ?1",
                        params![folder_id],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(|e| e.to_string())?;
                if folder.is_none() {
                    return Err(format!("Folder not found: {folder_id}"));
                }
            }

            let now = Self::now_ms();
            let folder_value = folder_id.map(str::to_string);
            db.execute(
                "UPDATE documents SET folder_id = ?1, updated_at = ?2 WHERE id = ?3",
                params![folder_value, now, document_id],
            )
            .map_err(|e| e.to_string())?;

            Ok(MoveDocumentResult {
                document_id: document_id.to_string(),
                folder_id: folder_id.map(str::to_string),
            })
        })
    }

    pub fn list_comment_threads(&self, document_id: &str) -> Result<Vec<CommentThreadRow>, String> {
        let mut thread_stmt = self
            .db
            .prepare(
                "SELECT id, document_id, quote, resolved, created_at
                 FROM comment_threads
                 WHERE document_id = ?1
                 ORDER BY created_at ASC",
            )
            .map_err(|e| e.to_string())?;

        let threads: Vec<(String, String, String, i64, i64)> = thread_stmt
            .query_map(params![document_id], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get::<_, i64>(3)?,
                    row.get(4)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        if threads.is_empty() {
            return Ok(Vec::new());
        }

        let mut comment_stmt = self
            .db
            .prepare(
                "SELECT id, thread_id, document_id, author, body, created_at
                 FROM comments
                 WHERE document_id = ?1
                 ORDER BY thread_id ASC, created_at ASC",
            )
            .map_err(|e| e.to_string())?;

        let comments = comment_stmt
            .query_map(params![document_id], |row| {
                Ok(CommentRow {
                    id: row.get(0)?,
                    thread_id: row.get(1)?,
                    document_id: row.get(2)?,
                    author: row.get(3)?,
                    body: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        let mut grouped: HashMap<String, Vec<CommentRow>> = HashMap::new();
        for comment in comments {
            grouped
                .entry(comment.thread_id.clone())
                .or_default()
                .push(comment);
        }

        Ok(threads
            .into_iter()
            .map(|(id, document_id, quote, resolved, created_at)| CommentThreadRow {
                id: id.clone(),
                document_id,
                quote,
                resolved: resolved != 0,
                created_at,
                comments: grouped.remove(&id).unwrap_or_default(),
            })
            .collect())
    }

    pub fn search_comments(&self, query: &str, limit: i64) -> Result<Vec<CommentSearchHit>, String> {
        let q = query.trim();
        if q.is_empty() {
            return Ok(Vec::new());
        }
        let max = limit.clamp(1, 100);
        let pattern = format!("%{}%", q.replace('%', ""));

        let mut stmt = self
            .db
            .prepare(
                "SELECT c.id AS comment_id, c.thread_id, c.document_id, c.author, c.body, c.created_at,
                        t.quote, t.resolved, d.title AS document_title
                 FROM comments c
                 JOIN comment_threads t ON t.id = c.thread_id
                 JOIN documents d ON d.id = c.document_id
                 WHERE d.deleted_at IS NULL
                   AND (c.body LIKE ?1 OR t.quote LIKE ?2)
                 ORDER BY c.created_at DESC
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![pattern, pattern, max], |row| {
                Ok(CommentSearchHit {
                    comment_id: row.get(0)?,
                    thread_id: row.get(1)?,
                    document_id: row.get(2)?,
                    author: row.get(3)?,
                    body: row.get(4)?,
                    created_at: row.get(5)?,
                    quote: row.get(6)?,
                    resolved: row.get::<_, i64>(7)? != 0,
                    document_title: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn list_document_revisions(
        &self,
        document_id: &str,
        limit: i64,
    ) -> Result<Vec<DocumentRevisionSummary>, String> {
        let max = limit.clamp(1, 50);
        let mut stmt = self
            .db
            .prepare(
                "SELECT id, document_id, title, created_at
                 FROM document_revisions
                 WHERE document_id = ?1
                 ORDER BY created_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![document_id, max], |row| {
                Ok(DocumentRevisionSummary {
                    id: row.get(0)?,
                    document_id: row.get(1)?,
                    title: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn get_document_revision(
        &self,
        revision_id: &str,
    ) -> Result<Option<DocumentRevisionDetail>, String> {
        let row = self
            .db
            .query_row(
                "SELECT id, document_id, title, content_json, created_at
                 FROM document_revisions WHERE id = ?1",
                params![revision_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, i64>(4)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;

        Ok(row.map(
            |(id, document_id, title, content_json, created_at)| DocumentRevisionDetail {
                id,
                document_id,
                title,
                created_at,
                content_json: content_json.clone(),
                plain_text: tiptap_to_plain_text(&content_json),
            },
        ))
    }

    pub fn semantic_search_documents(
        &self,
        sidecar: &NlpSidecar,
        query: &str,
        limit: i64,
    ) -> Result<Vec<SearchHit>, String> {
        search_library(&self.db, sidecar, query, limit, SearchMode::Semantic)
    }

    pub fn similar_documents_for(
        &self,
        document_id: &str,
        limit: i64,
    ) -> Result<Vec<SearchHit>, String> {
        if !is_nlp_enabled(&self.db)? {
            return Ok(Vec::new());
        }
        let model = get_document_embedding(&self.db, document_id)?
            .map(|item| item.model);
        similar_documents(&self.db, document_id, limit, model.as_deref())
    }

    pub fn extract_document_tasks(
        &self,
        sidecar: &NlpSidecar,
        document_id: &str,
    ) -> Result<Vec<DocumentTask>, String> {
        let row = self
            .db
            .query_row(
                "SELECT title, content_json, deleted_at FROM documents WHERE id = ?1",
                params![document_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<i64>>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let Some((title, content_json, deleted_at)) = row else {
            return Err(format!("Document not found: {document_id}"));
        };
        if deleted_at.is_some() {
            return Err(format!("Document not found: {document_id}"));
        }

        let mut tasks = extract_checkbox_tasks(&content_json);
        for task in &mut tasks {
            task.document_id = Some(document_id.to_string());
            task.document_title = Some(title.clone());
        }

        let nlp_enabled = is_nlp_enabled(&self.db)?;
        if nlp_enabled {
            sync_sidecar_backend(sidecar, &self.db)?;
            let text = format!("{title}\n{}", extract_search_text(&content_json));
            if let Ok(result) = sidecar.extract_tasks(&text) {
                append_phrase_tasks(&mut tasks, &result, document_id, &title);
            }
        }

        Ok(merge_document_tasks(tasks))
    }

    pub fn nlp_status(&self, sidecar: &NlpSidecar) -> Result<Value, String> {
        let enabled = is_nlp_enabled(&self.db)?;
        let indexed_count = count_embeddings(&self.db)?;
        let stored_model = dominant_embedding_model(&self.db)?;
        let embed_backend = get_embed_backend(&self.db)?;
        let script_path = sidecar.script_path().to_path_buf();
        let python_bin =
            std::env::var("SCRIBE_NLP_PYTHON").unwrap_or_else(|_| "python3".to_string());
        let sidecar_available = sidecar.script_exists();

        if !enabled {
            return Ok(json!({
                "enabled": false,
                "sidecarAvailable": sidecar_available,
                "sidecarOk": false,
                "version": Value::Null,
                "model": Value::Null,
                "indexedCount": indexed_count,
                "storedModel": stored_model,
                "indexStale": false,
                "staleIndexCount": 0,
                "embedBackend": embed_backend,
                "qualityAvailable": false,
                "scriptPath": script_path_label(&script_path),
                "pythonBin": python_bin,
                "error": Value::Null,
            }));
        }

        let (health, health_error, quality_available, current_model) = if sidecar_available {
            let _ = sync_sidecar_backend(sidecar, &self.db);
            match sidecar.health() {
                Ok(health) => {
                    let quality = health.quality_available.unwrap_or(false);
                    let model = Some(health.model.clone());
                    (Some(health), None, quality, model)
                }
                Err(error) => (None, Some(error), false, None),
            }
        } else {
            (None, None, false, None)
        };

        let stale_index_count = match current_model.as_deref() {
            Some(model) if indexed_count > 0 => count_stale_embeddings(&self.db, model)?,
            _ => 0,
        };
        let index_stale =
            indexed_count > 0 && stale_index_count > 0 && current_model.is_some();

        if let Some(health) = health {
            Ok(json!({
                "enabled": true,
                "sidecarAvailable": sidecar_available,
                "sidecarOk": health.ok,
                "version": health.version,
                "model": health.model,
                "indexedCount": indexed_count,
                "storedModel": stored_model,
                "indexStale": index_stale,
                "staleIndexCount": stale_index_count,
                "embedBackend": health.embed_backend.unwrap_or(embed_backend),
                "qualityAvailable": health.quality_available.unwrap_or(quality_available),
                "scriptPath": script_path_label(&script_path),
                "pythonBin": python_bin,
                "error": Value::Null,
            }))
        } else {
            Ok(json!({
                "enabled": true,
                "sidecarAvailable": sidecar_available,
                "sidecarOk": false,
                "version": Value::Null,
                "model": Value::Null,
                "indexedCount": indexed_count,
                "storedModel": stored_model,
                "indexStale": index_stale,
                "staleIndexCount": stale_index_count,
                "embedBackend": embed_backend,
                "qualityAvailable": quality_available,
                "scriptPath": script_path_label(&script_path),
                "pythonBin": python_bin,
                "error": health_error,
            }))
        }
    }

    pub fn trash_document(&self, id: &str) -> Result<IdTitle, String> {
        let id = id.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }

        self.run_writable(|db| {
            let row: Option<(String, Option<i64>)> = db
                .query_row(
                    "SELECT title, deleted_at FROM documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((title, deleted_at)) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document is already in trash: {id}"));
            }

            let now = Self::now_ms();
            db.execute(
                "UPDATE documents SET deleted_at = ?1 WHERE id = ?2",
                params![now, id],
            )
            .map_err(|e| e.to_string())?;
            remove_document_fts(db, id)?;

            Ok(IdTitle {
                id: id.to_string(),
                title,
            })
        })
    }

    pub fn rename_document(&self, id: &str, title: &str) -> Result<IdTitle, String> {
        let id = id.trim();
        let title = title.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }
        if title.is_empty() {
            return Err("title is required".to_string());
        }

        self.run_writable(|db| {
            let row: Option<(String, String, Option<i64>)> = db
                .query_row(
                    "SELECT title, content_json, deleted_at FROM documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((_, content_json, deleted_at)) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document not found: {id}"));
            }

            let now = Self::now_ms();
            db.execute(
                "UPDATE documents SET title = ?1, updated_at = ?2 WHERE id = ?3",
                params![title, now, id],
            )
            .map_err(|e| e.to_string())?;
            sync_document_fts(db, id, title, &content_json)?;

            Ok(IdTitle {
                id: id.to_string(),
                title: title.to_string(),
            })
        })
    }

    pub fn replace_document_content(&self, id: &str, content: &str) -> Result<IdTitle, String> {
        let id = id.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }

        let wiki_map: &'static HashMap<String, Option<String>> =
            Box::leak(Box::new(self.resolve_wiki_labels(content)));
        let resolver = Self::wiki_resolver_from_map(wiki_map);
        let content_json = plain_text_to_tiptap(content, Some(&resolver));

        self.run_writable(|db| {
            let row: Option<(String, String, Option<i64>)> = db
                .query_row(
                    "SELECT title, content_json, deleted_at FROM documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((title, existing_json, deleted_at)) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document not found: {id}"));
            }

            if existing_json != content_json {
                save_revision(db, id, &title, &existing_json)?;
            }

            let now = Self::now_ms();
            db.execute(
                "UPDATE documents SET content_json = ?1, updated_at = ?2 WHERE id = ?3",
                params![content_json, now, id],
            )
            .map_err(|e| e.to_string())?;
            sync_document_fts(db, id, &title, &content_json)?;
            sync_document_links(db, id, &content_json)?;

            Ok(IdTitle {
                id: id.to_string(),
                title,
            })
        })
    }

    pub fn set_document_favorite(&self, id: &str, favorite: bool) -> Result<IdTitle, String> {
        self.set_document_flag(id, "is_favorite", favorite)
    }

    pub fn set_document_pinned(&self, id: &str, pinned: bool) -> Result<IdTitle, String> {
        self.set_document_flag(id, "is_pinned", pinned)
    }

    fn set_document_flag(&self, id: &str, column: &str, value: bool) -> Result<IdTitle, String> {
        let id = id.trim();
        if id.is_empty() {
            return Err("id is required".to_string());
        }
        if column != "is_favorite" && column != "is_pinned" {
            return Err("invalid flag column".to_string());
        }

        self.run_writable(|db| {
            let row: Option<(String, Option<i64>)> = db
                .query_row(
                    "SELECT title, deleted_at FROM documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((title, deleted_at)) = row else {
                return Err(format!("Document not found: {id}"));
            };
            if deleted_at.is_some() {
                return Err(format!("Document not found: {id}"));
            }

            let sql = format!("UPDATE documents SET {column} = ?1, updated_at = ?2 WHERE id = ?3");
            db.execute(&sql, params![value as i64, Self::now_ms(), id])
                .map_err(|e| e.to_string())?;

            Ok(IdTitle {
                id: id.to_string(),
                title,
            })
        })
    }

    pub fn search_with_mode(
        &self,
        sidecar: &NlpSidecar,
        query: &str,
        limit: i64,
        mode: Option<&str>,
    ) -> Result<Vec<SearchHit>, String> {
        let enabled = is_nlp_enabled(&self.db)?;
        let search_mode = SearchMode::parse(mode, enabled);
        search_library(&self.db, sidecar, query, limit, search_mode)
    }

    pub fn journal_summary(
        &self,
        sidecar: &NlpSidecar,
        input: &JournalSummaryInput,
    ) -> Result<JournalSummary, String> {
        require_nlp(&self.db)?;

        let docs = load_journal_documents(&self.db, input)?;
        let count = docs.len() as i64;

        let mut combined = String::new();
        for (title, content_json) in docs {
            combined.push_str(&title);
            combined.push('\n');
            combined.push_str(&extract_search_text(&content_json));
            combined.push_str("\n\n");
        }

        if combined.trim().is_empty() {
            return Ok(JournalSummary {
                summary: String::new(),
                bullets: Vec::new(),
                document_count: 0,
            });
        }

        sync_sidecar_backend(sidecar, &self.db)?;
        let result = sidecar.summarize(&combined, 5)?;
        let summary = result
            .get("summary")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        let bullets = result
            .get("bullets")
            .and_then(|value| value.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(str::to_string))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let payload = json!({
            "fromDate": input.from_date,
            "toDate": input.to_date,
            "summary": summary,
            "bullets": bullets,
            "documentCount": count,
        });
        save_artifact(
            &self.db,
            &format!("journal:{}:{}", input.from_date, input.to_date),
            "journal_summary",
            &payload.to_string(),
            chrono::Utc::now().timestamp(),
        )?;

        Ok(JournalSummary {
            summary,
            bullets,
            document_count: count,
        })
    }

    pub fn suggest_tags(&self, sidecar: &NlpSidecar, document_id: &str) -> Result<TagSuggestions, String> {
        require_nlp(&self.db)?;

        let (title, content_json): (String, String) = self
            .db
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;

        let text = format!("{title}\n{}", extract_search_text(&content_json));
        sync_sidecar_backend(sidecar, &self.db)?;
        let result = sidecar.extract_entities(&text)?;

        let entities = result
            .get("entities")
            .and_then(|value| value.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| {
                        Some(NlpEntity {
                            text: item.get("text")?.as_str()?.to_string(),
                            kind: item.get("kind")?.as_str()?.to_string(),
                        })
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let tag_suggestions = result
            .get("tagSuggestions")
            .and_then(|value| value.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(str::to_string))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        Ok(TagSuggestions {
            entities,
            tag_suggestions,
        })
    }

    pub fn library_report(&self, sidecar: &NlpSidecar) -> Result<LibraryReport, String> {
        require_nlp(&self.db)?;

        let mut stmt = self
            .db
            .prepare(
                "SELECT id, title, content_json, tags, updated_at
                 FROM documents WHERE deleted_at IS NULL",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut documents = Vec::new();
        for row in rows {
            let (id, title, content_json, tags_json, updated_at) = row.map_err(|e| e.to_string())?;
            let tags = Self::parse_tags(tags_json);
            documents.push(json!({
                "id": id,
                "title": title,
                "text": extract_search_text(&content_json),
                "tags": tags,
                "updatedAt": updated_at,
            }));
        }

        sync_sidecar_backend(sidecar, &self.db)?;
        let result = sidecar.library_report(json!(documents))?;
        let markdown = result
            .get("markdown")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        let stats = result.get("stats").cloned().unwrap_or(json!({}));

        let now = chrono::Utc::now().timestamp();
        save_artifact(
            &self.db,
            &format!("library-report:{now}"),
            "library_report",
            &result.to_string(),
            now,
        )?;

        Ok(LibraryReport { markdown, stats })
    }

    pub fn journal_tasks(
        &self,
        sidecar: &NlpSidecar,
        document_ids: &[String],
    ) -> Result<Vec<DocumentTask>, String> {
        let nlp_enabled = is_nlp_enabled(&self.db)?;
        let mut combined = Vec::new();

        for document_id in document_ids {
            let row: Option<(String, String)> = self
                .db
                .query_row(
                    "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                    params![document_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            let Some((title, content_json)) = row else {
                continue;
            };

            let mut tasks = extract_checkbox_tasks(&content_json);
            for task in &mut tasks {
                task.document_id = Some(document_id.clone());
                task.document_title = Some(title.clone());
            }

            if nlp_enabled {
                sync_sidecar_backend(sidecar, &self.db)?;
                let text = format!("{title}\n{}", extract_search_text(&content_json));
                if let Ok(result) = sidecar.extract_tasks(&text) {
                    append_phrase_tasks(&mut tasks, &result, document_id, &title);
                }
            }

            combined.extend(tasks);
        }

        Ok(merge_document_tasks(combined))
    }

    pub fn index_document(&self, sidecar: &NlpSidecar, document_id: &str) -> Result<IndexResult, String> {
        require_nlp(&self.db)?;

        let (title, content_json): (String, String) = self
            .db
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;

        let text = format!("{title}\n{}", extract_search_text(&content_json));
        sync_sidecar_backend(sidecar, &self.db)?;
        let (vector, model) = sidecar.embed_text(&text)?;
        upsert_embedding(
            &self.db,
            document_id,
            &vector,
            &model,
            chrono::Utc::now().timestamp(),
        )?;

        Ok(IndexResult {
            indexed: 1,
            model,
        })
    }

    pub fn index_all_documents(&self, sidecar: &NlpSidecar) -> Result<IndexResult, String> {
        const BATCH_SIZE: usize = 24;

        require_nlp(&self.db)?;
        sync_sidecar_backend(sidecar, &self.db)?;

        let mut stmt = self
            .db
            .prepare("SELECT id, title, content_json FROM documents WHERE deleted_at IS NULL")
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

        let mut docs: Vec<(String, String)> = Vec::new();
        for row in rows {
            let (id, title, content_json) = row.map_err(|e| e.to_string())?;
            let text = format!("{title}\n{}", extract_search_text(&content_json));
            docs.push((id, text));
        }

        if docs.is_empty() {
            return Ok(IndexResult {
                indexed: 0,
                model: "none".to_string(),
            });
        }

        let mut indexed = 0i64;
        let mut model = "none".to_string();
        let now = chrono::Utc::now().timestamp();

        for chunk in docs.chunks(BATCH_SIZE) {
            let ids: Vec<String> = chunk.iter().map(|(id, _)| id.clone()).collect();
            let texts: Vec<String> = chunk.iter().map(|(_, text)| text.clone()).collect();
            let (vectors, batch_model) = sidecar.embed_batch(&texts)?;
            model = batch_model;

            for (document_id, vector) in ids.into_iter().zip(vectors.into_iter()) {
                upsert_embedding(&self.db, &document_id, &vector, &model, now)?;
                indexed += 1;
            }
        }

        Ok(IndexResult { indexed, model })
    }
}

fn require_nlp(conn: &Connection) -> Result<(), String> {
    if !is_nlp_enabled(conn)? {
        return Err("NLP is disabled".to_string());
    }
    Ok(())
}

fn parse_date_key(value: &str) -> Result<chrono::NaiveDate, String> {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|error| format!("Invalid date: {error}"))
}

fn date_key_bounds(from_date: &str, to_date: &str) -> Result<(i64, i64), String> {
    let from = parse_date_key(from_date)?;
    let to = parse_date_key(to_date)?;
    let start = from
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| "Invalid range start".to_string())?
        .and_utc()
        .timestamp();
    let end = to
        .and_hms_opt(23, 59, 59)
        .ok_or_else(|| "Invalid range end".to_string())?
        .and_utc()
        .timestamp();
    Ok((start, end))
}

fn load_journal_documents(
    conn: &Connection,
    input: &JournalSummaryInput,
) -> Result<Vec<(String, String)>, String> {
    if let Some(ids) = &input.document_ids {
        let unique = ids
            .iter()
            .map(|id| id.trim().to_string())
            .filter(|id| !id.is_empty())
            .collect::<Vec<_>>();
        if !unique.is_empty() {
            let placeholders = std::iter::repeat("?")
                .take(unique.len())
                .collect::<Vec<_>>()
                .join(", ");
            let sql = format!(
                "SELECT title, content_json FROM documents
                 WHERE deleted_at IS NULL AND id IN ({placeholders})
                 ORDER BY updated_at DESC"
            );
            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(rusqlite::params_from_iter(unique.iter()), |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| e.to_string())?;

            let mut docs = Vec::new();
            for row in rows {
                docs.push(row.map_err(|e| e.to_string())?);
            }
            return Ok(docs);
        }
    }

    let (start_ts, end_ts) = date_key_bounds(&input.from_date, &input.to_date)?;
    let mut stmt = conn
        .prepare(
            "SELECT title, content_json FROM documents
             WHERE deleted_at IS NULL
               AND updated_at BETWEEN ?1 AND ?2
               AND (
                 (?3 IS NOT NULL AND folder_id = ?3)
                 OR (
                   substr(title, 1, 10) GLOB '????-??-??'
                   AND substr(title, 1, 10) >= ?4
                   AND substr(title, 1, 10) <= ?5
                 )
               )
             ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(
            params![
                start_ts,
                end_ts,
                input.journal_folder_id,
                input.from_date,
                input.to_date
            ],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let mut docs = Vec::new();
    for row in rows {
        docs.push(row.map_err(|e| e.to_string())?);
    }
    Ok(docs)
}

pub fn sync_sidecar_backend(sidecar: &NlpSidecar, conn: &Connection) -> Result<(), String> {
    let backend = get_embed_backend(conn)?;
    let _ = sidecar.configure_embed_backend(&backend);
    Ok(())
}

pub fn search_library(
    conn: &Connection,
    sidecar: &NlpSidecar,
    query: &str,
    limit: i64,
    mode: SearchMode,
) -> Result<Vec<SearchHit>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    match mode {
        SearchMode::Fts => {
            let hits = search_documents_in_conn(conn, q, limit)?;
            Ok(hits
                .into_iter()
                .map(|mut hit| {
                    hit.match_kind = Some("fts".to_string());
                    hit
                })
                .collect())
        }
        SearchMode::Semantic => {
            if !is_nlp_enabled(conn)? {
                return search_library(conn, sidecar, q, limit, SearchMode::Fts);
            }
            sync_sidecar_backend(sidecar, conn)?;
            let (vector, model) = sidecar.embed_text(q)?;
            Ok(semantic_search(conn, &vector, limit, Some(&model))?)
        }
        SearchMode::Hybrid => {
            let fts_hits = search_documents_in_conn(conn, q, limit)?;
            if !is_nlp_enabled(conn)? {
                return Ok(fts_hits
                    .into_iter()
                    .map(|mut hit| {
                        hit.match_kind = Some("fts".to_string());
                        hit
                    })
                    .collect());
            }
            sync_sidecar_backend(sidecar, conn)?;
            let semantic_hits = match sidecar.embed_text(q) {
                Ok((vector, model)) => semantic_search(conn, &vector, limit, Some(&model)).unwrap_or_default(),
                Err(_) => Vec::new(),
            };
            Ok(fuse_search_hits(&fts_hits, &semantic_hits, limit))
        }
    }
}

fn assert_db_exists(db_path: &Path) -> Result<(), String> {
    if !db_path.exists() {
        return Err(format!(
            "Scribe database not found at {}. Open Scribe once to create it, or set SCRIBE_DB_PATH.",
            db_path.display()
        ));
    }
    Ok(())
}

fn open_writable(db_path: &Path) -> Result<ScribeStore, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|e| e.to_string())?;
    migrations::run_migrations(&conn).map_err(|e| e.to_string())?;
    Ok(ScribeStore {
        db: conn,
        writable: true,
    })
}

fn open_readonly(db_path: &Path) -> Result<ScribeStore, String> {
    let conn = Connection::open_with_flags(
        db_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA query_only = ON;")
        .map_err(|e| e.to_string())?;
    Ok(ScribeStore {
        db: conn,
        writable: false,
    })
}

pub fn open_scribe_store(db_path: Option<PathBuf>) -> Result<OpenStoreResult, String> {
    let db_path = db_path.unwrap_or_else(default_db_path);
    assert_db_exists(&db_path)?;

    let force_readonly = std::env::var("SCRIBE_MCP_WRITE").ok().as_deref() == Some("0");

    if !force_readonly {
        match open_writable(&db_path) {
            Ok(store) => {
                return Ok(OpenStoreResult {
                    store,
                    writable: true,
                    db_path,
                });
            }
            Err(error) => {
                eprintln!(
                    "[scribe-mcp] Writable open failed (falling back to readonly): {error}"
                );
            }
        }
    }

    let store = open_readonly(&db_path)?;
    Ok(OpenStoreResult {
        store,
        writable: false,
        db_path,
    })
}
