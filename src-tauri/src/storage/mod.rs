use rusqlite::Connection;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub const META_DOCUMENTS_DIR: &str = "documents_dir";
pub const FILE_EXTENSION: &str = "scribe";

fn default_disk_version() -> u8 {
    1
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskDocument {
    #[serde(default = "default_disk_version")]
    pub version: u8,
    pub id: String,
    pub title: String,
    #[serde(alias = "content_json")]
    pub content_json: String,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

pub fn default_documents_dir() -> PathBuf {
    dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Scribe")
}

pub fn get_documents_dir(_app: &AppHandle, conn: &Connection) -> Result<PathBuf, String> {
    let stored: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE key = ?1",
            [META_DOCUMENTS_DIR],
            |row| row.get(0),
        )
        .ok();

    let dir = stored
        .map(PathBuf::from)
        .unwrap_or_else(default_documents_dir);

    ensure_documents_dir(&dir)?;
    Ok(dir)
}

pub fn set_documents_dir(conn: &Connection, path: &Path) -> Result<PathBuf, String> {
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Neplatná cesta: {e}"))?;

    ensure_documents_dir(&canonical)?;

    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
        rusqlite::params![META_DOCUMENTS_DIR, canonical.to_string_lossy().to_string()],
    )
    .map_err(|e| e.to_string())?;

    Ok(canonical)
}

pub fn ensure_documents_dir(path: &Path) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| format!("Nepodarilo sa vytvoriť priečinok: {e}"))
}

pub fn sanitize_filename(title: &str) -> String {
    let mut slug: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' {
                c
            } else {
                ' '
            }
        })
        .collect();

    while slug.contains("  ") {
        slug = slug.replace("  ", " ");
    }

    let slug = slug.trim().to_string();
    if slug.is_empty() {
        return "Dokument".to_string();
    }

    slug.chars().take(72).collect()
}

pub fn file_path_for_title(dir: &Path, title: &str, id: &str) -> PathBuf {
    let slug = sanitize_filename(title);
    let short_id = &id[..8.min(id.len())];
    dir.join(format!("{slug}-{short_id}.{FILE_EXTENSION}"))
}

pub fn resolve_unique_path(dir: &Path, title: &str, id: &str) -> PathBuf {
    let mut candidate = file_path_for_title(dir, title, id);
    if !candidate.exists() {
        return candidate;
    }

    // Same document re-save
    if let Ok(existing) = std::fs::read_to_string(&candidate) {
        if existing.contains(id) {
            return candidate;
        }
    }

    let slug = sanitize_filename(title);
    let short_id = &id[..8.min(id.len())];
    for i in 2..100 {
        candidate = dir.join(format!("{slug}-{short_id}-{i}.{FILE_EXTENSION}"));
        if !candidate.exists() {
            return candidate;
        }
    }

    file_path_for_title(dir, title, id)
}

pub fn write_document_file(
    dir: &Path,
    doc: &DiskDocument,
    old_path: Option<&str>,
) -> Result<PathBuf, String> {
    ensure_documents_dir(dir)?;
    let path = resolve_unique_path(dir, &doc.title, &doc.id);
    let payload = serde_json::to_string_pretty(doc).map_err(|e| e.to_string())?;
    std::fs::write(&path, payload).map_err(|e| format!("Nepodarilo sa uložiť súbor: {e}"))?;

    if let Some(old) = old_path {
        let old_path = Path::new(old);
        if old_path != path.as_path() && old_path.exists() {
            let _ = std::fs::remove_file(old_path);
        }
        // migrate legacy .scribe.json
        if let Some(stem) = old_path.file_stem().and_then(|s| s.to_str()) {
            let legacy = dir.join(format!("{stem}.scribe.json"));
            if legacy.exists() && legacy != path {
                let _ = std::fs::remove_file(legacy);
            }
        }
    }

    // Clean legacy id-based json file if exists
    let legacy_id_json = dir.join(format!("{}.scribe.json", doc.id));
    if legacy_id_json.exists() && legacy_id_json != path {
        let _ = std::fs::remove_file(legacy_id_json);
    }

    Ok(path)
}

pub fn delete_document_file(path: &str) -> Result<(), String> {
    let file = Path::new(path);
    if file.exists() {
        std::fs::remove_file(file).map_err(|e| format!("Nepodarilo sa vymazať súbor: {e}"))?;
    }
    Ok(())
}

pub fn read_scribe_file(path: &Path) -> Result<DiskDocument, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| format!("Nepodarilo sa prečítať súbor: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("Neplatný .scribe súbor: {e}"))
}

pub fn sync_all_documents_to_disk(
    app: &AppHandle,
    conn: &Connection,
) -> Result<(), String> {
    let dir = get_documents_dir(app, conn)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, title, content_json, created_at, updated_at, file_path FROM documents",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (id, title, content_json, created_at, updated_at, file_path) =
            row.map_err(|e| e.to_string())?;

        if document_file_is_current(file_path.as_deref(), updated_at)? {
            continue;
        }

        let disk_doc = DiskDocument {
            version: 1,
            id: id.clone(),
            title,
            content_json,
            created_at,
            updated_at,
        };

        let path = write_document_file(&dir, &disk_doc, file_path.as_deref())?;
        let path_str = path.to_string_lossy().to_string();

        if file_path.as_deref() != Some(path_str.as_str()) {
            conn.execute(
                "UPDATE documents SET file_path = ?1 WHERE id = ?2",
                rusqlite::params![path_str, id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn document_file_is_current(file_path: Option<&str>, updated_at: i64) -> Result<bool, String> {
    let Some(path) = file_path else {
        return Ok(false);
    };

    let file = Path::new(path);
    if !file.is_file() {
        return Ok(false);
    }

    let modified = file
        .metadata()
        .and_then(|meta| meta.modified())
        .map_err(|e| format!("Nepodarilo sa prečítať metadáta súboru: {e}"))?;

    let file_ts = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Neplatný čas súboru: {e}"))?
        .as_secs() as i64;

    Ok(file_ts >= updated_at)
}

pub fn collect_scribe_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let skip = path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with('.') || name == "assets");
            if skip {
                continue;
            }
            collect_scribe_files(&path, out)?;
            continue;
        }

        if path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case(FILE_EXTENSION))
        {
            out.push(path);
            continue;
        }

        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.to_ascii_lowercase().ends_with(".scribe.json"))
        {
            out.push(path);
        }
    }

    Ok(())
}
