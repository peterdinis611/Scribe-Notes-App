use crate::storage::{self, DiskDocument, DiskPersistQueue, PersistJob};
use rusqlite::Connection;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageSettings {
    pub documents_dir: String,
}

#[tauri::command]
pub fn get_storage_settings(
    app: AppHandle,
    state: tauri::State<'_, crate::db::DbState>,
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
    state: tauri::State<'_, crate::db::DbState>,
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
    storage::reconcile_storage(&app, &conn)?;

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

pub fn queue_document_persist(
    app: &AppHandle,
    conn: &Connection,
    queue: &DiskPersistQueue,
    id: &str,
    title: &str,
    content_json: &str,
    created_at: i64,
    updated_at: i64,
) -> Result<(), String> {
    let old_path: Option<String> = conn
        .query_row(
            "SELECT file_path FROM documents WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    let dir = storage::get_documents_dir(app, conn)?;

    queue.schedule(PersistJob {
        id: id.to_string(),
        title: title.to_string(),
        content_json: content_json.to_string(),
        created_at,
        updated_at,
        old_path,
        documents_dir: dir,
    });

    Ok(())
}

pub fn flush_document_persist(
    queue: &DiskPersistQueue,
    id: Option<&str>,
) -> Result<u32, String> {
    queue.flush(id)
}
