use crate::storage::{self, DiskDocument};
use rusqlite::Connection;
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::db::DbState;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageSettings {
    pub documents_dir: String,
}

#[tauri::command]
pub fn get_storage_settings(
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<StorageSettings, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let dir = storage::get_documents_dir(&app, &conn)?;
    Ok(StorageSettings {
        documents_dir: dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn pick_documents_directory(
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Option<StorageSettings>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Vyberte priečinok pre dokumenty")
        .blocking_pick_folder();

    let Some(path) = picked else {
        return Ok(None);
    };

    let path = PathBuf::from(path.to_string());
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let dir = storage::set_documents_dir(&conn, &path)?;
    storage::sync_all_documents_to_disk(&app, &conn)?;

    Ok(Some(StorageSettings {
        documents_dir: dir.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
pub fn reveal_in_finder(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| e.to_string())
}

pub fn persist_document(
    app: &AppHandle,
    conn: &Connection,
    id: &str,
    title: &str,
    content_json: &str,
    created_at: i64,
    updated_at: i64,
) -> Result<String, String> {
    let old_path: Option<String> = conn
        .query_row(
            "SELECT file_path FROM documents WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    let dir = storage::get_documents_dir(app, conn)?;
    let disk_doc = DiskDocument {
        version: 1,
        id: id.to_string(),
        title: title.to_string(),
        content_json: content_json.to_string(),
        created_at,
        updated_at,
    };

    let path = storage::write_document_file(&dir, &disk_doc, old_path.as_deref())?;
    let path_str = path.to_string_lossy().to_string();

    conn.execute(
        "UPDATE documents SET file_path = ?1 WHERE id = ?2",
        rusqlite::params![path_str, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(path_str)
}
