use crate::db::DbState;
use crate::libraries::{
    self, Library, Manuscript, SyncConflict, suggested_sibling_root,
};
use crate::storage;
use serde::Deserialize;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn list_libraries(state: State<'_, DbState>) -> Result<Vec<Library>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    libraries::list_libraries(&conn)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLibraryInput {
    pub name: String,
}

#[tauri::command]
pub fn create_library(
    app: AppHandle,
    state: State<'_, DbState>,
    input: CreateLibraryInput,
) -> Result<Library, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let current = storage::get_documents_dir(&app, &conn)?;
    let root = suggested_sibling_root(&current, input.name.trim());
    libraries::create_library(&conn, &input.name, &root)
}

#[tauri::command]
pub fn switch_library(state: State<'_, DbState>, id: String) -> Result<Library, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    libraries::switch_library(&conn, &id)
}

#[tauri::command]
pub fn list_sync_conflicts(state: State<'_, DbState>) -> Result<Vec<SyncConflict>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    libraries::list_open_conflicts(&conn)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveConflictInput {
    pub id: String,
    pub keep: String,
}

#[tauri::command]
pub fn resolve_sync_conflict(
    app: AppHandle,
    state: State<'_, DbState>,
    input: ResolveConflictInput,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let conflict = libraries::list_open_conflicts(&conn)?
        .into_iter()
        .find(|item| item.id == input.id)
        .ok_or_else(|| "Konflikt už nie je otvorený".to_string())?;

    match input.keep.as_str() {
        "app" => {
            let (title, content, created, updated): (String, String, i64, i64) = conn
                .query_row(
                    "SELECT title, content_json, created_at, updated_at FROM documents WHERE id = ?1",
                    [&conflict.document_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                )
                .map_err(|e| e.to_string())?;
            super::storage::persist_document(
                &app,
                &conn,
                &conflict.document_id,
                &title,
                &content,
                created,
                updated,
            )?;
        }
        "disk" => {
            // Disk already won on next reconcile; mark resolved so the toast can close.
        }
        other => return Err(format!("Neznáme riešenie konfliktu: {other}")),
    }

    libraries::resolve_conflict(&conn, &input.id)
}

#[tauri::command]
pub fn list_manuscripts(state: State<'_, DbState>) -> Result<Vec<Manuscript>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    libraries::list_manuscripts(&conn)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertManuscriptInput {
    pub id: Option<String>,
    pub title: String,
    pub chapter_ids: Vec<String>,
}

#[tauri::command]
pub fn upsert_manuscript(
    state: State<'_, DbState>,
    input: UpsertManuscriptInput,
) -> Result<Manuscript, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    libraries::upsert_manuscript(&conn, input.id, &input.title, &input.chapter_ids)
}
