use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::storage::{ensure_documents_dir, set_documents_dir};

pub const DEFAULT_LIBRARY_ID: &str = "default";
pub const META_ACTIVE_LIBRARY: &str = "active_library_id";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub created_at: i64,
    pub last_opened_at: i64,
    pub sort_order: i32,
    pub is_active: bool,
}

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

pub fn active_library_id(conn: &Connection) -> String {
    conn.query_row(
        "SELECT value FROM meta WHERE key = ?1",
        [META_ACTIVE_LIBRARY],
        |row| row.get(0),
    )
    .unwrap_or_else(|_| DEFAULT_LIBRARY_ID.to_string())
}

pub fn list_libraries(conn: &Connection) -> Result<Vec<Library>, String> {
    let active = active_library_id(conn);
    let mut stmt = conn
        .prepare(
            "SELECT id, name, root_path, created_at, last_opened_at, sort_order \
             FROM libraries ORDER BY sort_order ASC, name COLLATE NOCASE ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            Ok(Library {
                is_active: id == active,
                id,
                name: row.get(1)?,
                root_path: row.get(2)?,
                created_at: row.get(3)?,
                last_opened_at: row.get(4)?,
                sort_order: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn create_library(conn: &Connection, name: &str, root_path: &Path) -> Result<Library, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Názov knižnice nemôže byť prázdny".into());
    }
    ensure_documents_dir(root_path)?;
    let canonical = root_path
        .canonicalize()
        .map_err(|e| format!("Neplatná cesta knižnice: {e}"))?;
    let id = Uuid::new_v4().to_string();
    let now = now_ts();
    let root = canonical.to_string_lossy().to_string();
    let max_order: i32 = conn
        .query_row("SELECT COALESCE(MAX(sort_order), 0) FROM libraries", [], |row| row.get(0))
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO libraries (id, name, root_path, created_at, last_opened_at, sort_order) \
         VALUES (?1, ?2, ?3, ?4, ?4, ?5)",
        params![id, name, root, now, max_order + 1],
    )
    .map_err(|e| e.to_string())?;
    Ok(Library {
        id,
        name: name.to_string(),
        root_path: root,
        created_at: now,
        last_opened_at: now,
        sort_order: max_order + 1,
        is_active: false,
    })
}

pub fn switch_library(conn: &Connection, id: &str) -> Result<Library, String> {
    let now = now_ts();
    conn.execute(
        "UPDATE libraries SET last_opened_at = ?1 WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| e.to_string())?;
    let library = conn
        .query_row(
            "SELECT id, name, root_path, created_at, last_opened_at, sort_order FROM libraries WHERE id = ?1",
            [id],
            |row| {
                Ok(Library {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    root_path: row.get(2)?,
                    created_at: row.get(3)?,
                    last_opened_at: row.get(4)?,
                    sort_order: row.get(5)?,
                    is_active: true,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Knižnica neexistuje: {id}"))?;

    if !library.root_path.is_empty() {
        set_documents_dir(conn, Path::new(&library.root_path))?;
    }
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
        params![META_ACTIVE_LIBRARY, library.id],
    )
    .map_err(|e| e.to_string())?;
    Ok(library)
}

pub fn suggested_sibling_root(base: &Path, name: &str) -> PathBuf {
    let parent = base.parent().unwrap_or(base);
    parent.join(format!("Scribe {name}"))
}

pub fn update_active_root(conn: &Connection, path: &Path) -> Result<(), String> {
    let id = active_library_id(conn);
    conn.execute(
        "UPDATE libraries SET root_path = ?1 WHERE id = ?2",
        params![path.to_string_lossy().to_string(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflict {
    pub id: String,
    pub document_id: String,
    pub title: String,
    pub disk_updated_at: i64,
    pub db_updated_at: i64,
    pub created_at: i64,
}

pub fn list_open_conflicts(conn: &Connection) -> Result<Vec<SyncConflict>, String> {
    let library_id = active_library_id(conn);
    let mut stmt = conn
        .prepare(
            "SELECT id, document_id, title, disk_updated_at, db_updated_at, created_at \
             FROM sync_conflicts WHERE resolved = 0 AND library_id = ?1 ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([library_id], |row| {
            Ok(SyncConflict {
                id: row.get(0)?,
                document_id: row.get(1)?,
                title: row.get(2)?,
                disk_updated_at: row.get(3)?,
                db_updated_at: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn record_conflict(
    conn: &Connection,
    document_id: &str,
    title: &str,
    disk_updated_at: i64,
    db_updated_at: i64,
) -> Result<(), String> {
    let now = now_ts();
    let library_id = active_library_id(conn);
    conn.execute(
        "INSERT INTO sync_conflicts (id, document_id, title, disk_updated_at, db_updated_at, created_at, resolved, library_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
        params![Uuid::new_v4().to_string(), document_id, title, disk_updated_at, db_updated_at, now, library_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn resolve_conflict(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE sync_conflicts SET resolved = 1 WHERE id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manuscript {
    pub id: String,
    pub library_id: String,
    pub title: String,
    pub chapter_ids: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn list_manuscripts(conn: &Connection) -> Result<Vec<Manuscript>, String> {
    let library_id = active_library_id(conn);
    let mut stmt = conn
        .prepare(
            "SELECT id, library_id, title, chapter_ids_json, created_at, updated_at \
             FROM manuscripts WHERE library_id = ?1 ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([library_id], |row| {
            let raw: String = row.get(3)?;
            Ok(Manuscript {
                id: row.get(0)?,
                library_id: row.get(1)?,
                title: row.get(2)?,
                chapter_ids: serde_json::from_str(&raw).unwrap_or_default(),
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn upsert_manuscript(
    conn: &Connection,
    id: Option<String>,
    title: &str,
    chapter_ids: &[String],
) -> Result<Manuscript, String> {
    let library_id = active_library_id(conn);
    let now = now_ts();
    let title = title.trim();
    if title.is_empty() {
        return Err("Názov zostavenia nemôže byť prázdny".into());
    }
    let json = serde_json::to_string(chapter_ids).unwrap_or_else(|_| "[]".into());
    let id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    conn.execute(
        "INSERT INTO manuscripts (id, library_id, title, chapter_ids_json, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?5) \
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, chapter_ids_json = excluded.chapter_ids_json, \
         updated_at = excluded.updated_at",
        params![id, library_id, title, json, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(Manuscript {
        id,
        library_id,
        title: title.to_string(),
        chapter_ids: chapter_ids.to_vec(),
        created_at: now,
        updated_at: now,
    })
}
