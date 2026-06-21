use crate::commands::documents::{map_document, Document, DOCUMENT_SELECT};
use crate::db::DbState;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRevision {
    pub id: String,
    pub document_id: String,
    pub title: String,
    pub created_at: i64,
}

#[tauri::command]
pub fn list_document_revisions(
    state: State<'_, DbState>,
    document_id: String,
    limit: Option<i64>,
) -> Result<Vec<DocumentRevision>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let max = limit.unwrap_or(20).clamp(1, 50);

    let mut stmt = conn
        .prepare(
            "SELECT id, document_id, title, created_at FROM document_revisions WHERE document_id = ?1 ORDER BY created_at DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![document_id, max], |row| {
            Ok(DocumentRevision {
                id: row.get(0)?,
                document_id: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_document_revision(
    state: State<'_, DbState>,
    revision_id: String,
) -> Result<Document, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let (document_id, title, content_json): (String, String, String) = conn
        .query_row(
            "SELECT document_id, title, content_json FROM document_revisions WHERE id = ?1",
            params![revision_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "UPDATE documents SET title = ?1, content_json = ?2, updated_at = ?3 WHERE id = ?4",
        params![title, content_json, now, document_id],
    )
    .map_err(|e| e.to_string())?;

    crate::db::fts::sync_document_fts(&conn, &document_id, &title, &content_json)?;

    conn.query_row(
        &format!("{DOCUMENT_SELECT} WHERE id = ?1"),
        params![document_id],
        map_document,
    )
    .map_err(|e| e.to_string())
}
