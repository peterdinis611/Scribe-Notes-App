use crate::commands::storage::persist_document;
use crate::db::DbState;
use crate::storage;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
    pub file_path: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub title: String,
    pub content_json: String,
    pub folder_id: Option<String>,
    pub file_path: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentInput {
    pub title: String,
    pub folder_id: Option<String>,
    pub content_json: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDocumentInput {
    pub id: String,
    pub title: Option<String>,
    pub content_json: Option<String>,
}

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

pub fn map_document(row: &rusqlite::Row<'_>) -> rusqlite::Result<Document> {
    Ok(Document {
        id: row.get(0)?,
        title: row.get(1)?,
        content_json: row.get(2)?,
        folder_id: row.get(3)?,
        file_path: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

pub const DOCUMENT_SELECT: &str =
    "SELECT id, title, content_json, folder_id, file_path, created_at, updated_at FROM documents";

#[tauri::command]
pub fn list_documents(state: State<'_, DbState>) -> Result<Vec<DocumentSummary>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, title, folder_id, file_path, updated_at FROM documents ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(DocumentSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                folder_id: row.get(2)?,
                file_path: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_document(state: State<'_, DbState>, id: String) -> Result<Document, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("{DOCUMENT_SELECT} WHERE id = ?1"),
        params![id],
        map_document,
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Document not found: {id}"))
}

#[tauri::command]
pub fn create_document(
    app: AppHandle,
    state: State<'_, DbState>,
    input: CreateDocumentInput,
) -> Result<Document, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let now = now_ts();
    let content_json = input
        .content_json
        .filter(|c| !c.trim().is_empty())
        .unwrap_or_else(|| r#"{"type":"doc","content":[{"type":"paragraph"}]}"#.to_string());

    let folder_id = match input.folder_id {
        Some(id) => Some(id),
        None => super::folders::default_folder_id(&conn)?,
    };

    conn.execute(
        "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5)",
        params![id, input.title, content_json, folder_id, now],
    )
    .map_err(|e| e.to_string())?;

    crate::db::sync_document_fts(&conn, &id, &input.title, &content_json)?;

    let file_path = persist_document(
        &app,
        &conn,
        &id,
        &input.title,
        &content_json,
        now,
        now,
    )?;

    Ok(Document {
        id,
        title: input.title,
        content_json: content_json.clone(),
        folder_id,
        file_path: Some(file_path),
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub fn update_document(
    app: AppHandle,
    state: State<'_, DbState>,
    input: UpdateDocumentInput,
) -> Result<Document, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let existing = conn
        .query_row(
            &format!("{DOCUMENT_SELECT} WHERE id = ?1"),
            params![input.id],
            map_document,
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Document not found: {}", input.id))?;

    let title = input.title.unwrap_or(existing.title.clone());
    let content_json = input
        .content_json
        .unwrap_or_else(|| existing.content_json.clone());
    let now = now_ts();

    if content_json != existing.content_json || title != existing.title {
        crate::db::save_revision(
            &conn,
            &existing.id,
            &existing.title,
            &existing.content_json,
        )?;
    }

    conn.execute(
        "UPDATE documents SET title = ?1, content_json = ?2, updated_at = ?3 WHERE id = ?4",
        params![title, content_json, now, input.id],
    )
    .map_err(|e| e.to_string())?;

    crate::db::sync_document_fts(&conn, &input.id, &title, &content_json)?;

    let file_path = persist_document(
        &app,
        &conn,
        &input.id,
        &title,
        &content_json,
        existing.created_at,
        now,
    )?;

    Ok(Document {
        id: input.id,
        title,
        content_json,
        folder_id: existing.folder_id,
        file_path: Some(file_path),
        created_at: existing.created_at,
        updated_at: now,
    })
}

#[tauri::command]
pub fn delete_document(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let file_path: Option<String> = conn
        .query_row(
            "SELECT file_path FROM documents WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();

    conn.execute("DELETE FROM documents WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    crate::db::remove_document_fts(&conn, &id)?;

    if let Some(path) = file_path {
        storage::delete_document_file(&path)?;
    }

    Ok(())
}

#[tauri::command]
pub fn clear_all_documents(app: AppHandle, state: State<'_, DbState>) -> Result<u32, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let dir = storage::get_documents_dir(&app, &conn)?;

    conn.execute("DELETE FROM documents", [])
        .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM documents_fts", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM document_revisions", [])
        .map_err(|e| e.to_string())?;

    let mut removed = 0u32;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file()
                && path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case(storage::FILE_EXTENSION))
            {
                storage::delete_document_file(&path.to_string_lossy())?;
                removed += 1;
            }
        }
    }

    let assets_dir = dir.join("assets");
    if assets_dir.exists() {
        std::fs::remove_dir_all(&assets_dir)
            .map_err(|e| format!("Nepodarilo sa vymazať obrázky: {e}"))?;
    }

    Ok(removed)
}
