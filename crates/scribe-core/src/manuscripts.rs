//! Manuscript compile/list — shared by Tauri and MCP.

use rusqlite::{params, Connection};
use serde::Serialize;
use uuid::Uuid;

use crate::db::active_library_id;
use crate::store::ScribeStore;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManuscriptRecord {
    pub id: String,
    pub library_id: String,
    pub title: String,
    pub chapter_ids: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn list_manuscripts(conn: &Connection) -> Result<Vec<ManuscriptRecord>, String> {
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
            Ok(ManuscriptRecord {
                id: row.get(0)?,
                library_id: row.get(1)?,
                title: row.get(2)?,
                chapter_ids: serde_json::from_str(&raw).unwrap_or_default(),
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn get_manuscript(conn: &Connection, id: &str) -> Result<ManuscriptRecord, String> {
    let library_id = active_library_id(conn);
    conn.query_row(
        "SELECT id, library_id, title, chapter_ids_json, created_at, updated_at \
         FROM manuscripts WHERE id = ?1 AND library_id = ?2",
        params![id, library_id],
        |row| {
            let raw: String = row.get(3)?;
            Ok(ManuscriptRecord {
                id: row.get(0)?,
                library_id: row.get(1)?,
                title: row.get(2)?,
                chapter_ids: serde_json::from_str(&raw).unwrap_or_default(),
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )
    .map_err(|_| format!("Manuscript not found: {id}"))
}

pub fn upsert_manuscript(
    conn: &Connection,
    id: Option<&str>,
    title: &str,
    chapter_ids: &[String],
) -> Result<ManuscriptRecord, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("title is required".to_string());
    }
    let library_id = active_library_id(conn);
    let now = chrono::Utc::now().timestamp();
    let json = serde_json::to_string(chapter_ids).unwrap_or_else(|_| "[]".into());
    let id = id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    conn.execute(
        "INSERT INTO manuscripts (id, library_id, title, chapter_ids_json, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?5) \
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, chapter_ids_json = excluded.chapter_ids_json, \
         updated_at = excluded.updated_at",
        params![id, library_id, title, json, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(ManuscriptRecord {
        id,
        library_id,
        title: title.to_string(),
        chapter_ids: chapter_ids.to_vec(),
        created_at: now,
        updated_at: now,
    })
}

impl ScribeStore {
    pub fn list_manuscripts(&self) -> Result<Vec<ManuscriptRecord>, String> {
        list_manuscripts(&self.db)
    }

    pub fn get_manuscript(&self, id: &str) -> Result<ManuscriptRecord, String> {
        get_manuscript(&self.db, id)
    }

    pub fn upsert_manuscript(
        &self,
        id: Option<&str>,
        title: &str,
        chapter_ids: &[String],
    ) -> Result<ManuscriptRecord, String> {
        self.run_writable(|db| upsert_manuscript(db, id, title, chapter_ids))
    }
}
