use crate::commands::documents::{map_document, Document, DOCUMENT_SELECT};
use crate::commands::storage::{flush_document_persist, persist_document};
use crate::db::{fetch_revision, restore_document_content, DbState};
use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, State};

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRevisionDetail {
    pub id: String,
    pub document_id: String,
    pub title: String,
    pub content_json: String,
    pub created_at: i64,
}

#[tauri::command]
pub fn get_document_revision(
    state: State<'_, DbState>,
    revision_id: String,
) -> Result<DocumentRevisionDetail, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, document_id, title, content_json, created_at FROM document_revisions WHERE id = ?1",
        params![revision_id],
        |row| {
            Ok(DocumentRevisionDetail {
                id: row.get(0)?,
                document_id: row.get(1)?,
                title: row.get(2)?,
                content_json: row.get(3)?,
                created_at: row.get(4)?,
            })
        },
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => "Verzia neexistuje".to_string(),
        other => other.to_string(),
    })
}

#[tauri::command]
pub fn restore_document_revision(
    app: AppHandle,
    state: State<'_, DbState>,
    revision_id: String,
) -> Result<Document, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let (document_id, title, content_json) = fetch_revision(&conn, &revision_id)?;

    let existing = conn
        .query_row(
            &format!("{DOCUMENT_SELECT} WHERE id = ?1"),
            params![document_id],
            map_document,
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                format!("Dokument neexistuje: {document_id}")
            }
            other => other.to_string(),
        })?;

    let now = chrono::Utc::now().timestamp();

    restore_document_content(
        &conn,
        &document_id,
        &title,
        &content_json,
        &existing.title,
        &existing.content_json,
        now,
    )?;

    let _ = flush_document_persist(&state.persist_queue, Some(&document_id));

    let file_path = persist_document(
        &app,
        &conn,
        &document_id,
        &title,
        &content_json,
        existing.created_at,
        now,
    )?;

    Ok(Document {
        id: document_id,
        title,
        content_json,
        folder_id: existing.folder_id,
        file_path: Some(file_path),
        created_at: existing.created_at,
        updated_at: now,
    })
}
