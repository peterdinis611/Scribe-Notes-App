use crate::db::DbState;
use crate::nlp::NlpSidecar;
use serde::Deserialize;
use tauri::State;

pub use scribe_core::{SmartFolderEval, SmartFolderRecord};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertSmartFolderInput {
    pub id: Option<String>,
    pub name: String,
    pub query_rule: String,
    pub icon: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluateSmartFolderInput {
    pub id: Option<String>,
    pub query_rule: Option<String>,
    pub limit: Option<i64>,
}

#[tauri::command]
pub fn list_smart_folders(state: State<'_, DbState>) -> Result<Vec<SmartFolderRecord>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    scribe_core::list_smart_folders_in_conn(&conn)
}

#[tauri::command]
pub fn upsert_smart_folder(
    state: State<'_, DbState>,
    input: UpsertSmartFolderInput,
) -> Result<SmartFolderRecord, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    scribe_core::upsert_smart_folder_in_conn(
        &conn,
        input.id.as_deref(),
        &input.name,
        &input.query_rule,
        input.icon.as_deref(),
    )
}

#[tauri::command]
pub fn delete_smart_folder(state: State<'_, DbState>, id: String) -> Result<bool, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    scribe_core::delete_smart_folder_in_conn(&conn, &id)
}

#[tauri::command]
pub fn evaluate_smart_folder(
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    input: EvaluateSmartFolderInput,
) -> Result<SmartFolderEval, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    scribe_core::evaluate_smart_folder_in_conn(
        &conn,
        &sidecar,
        input.id.as_deref(),
        input.query_rule.as_deref(),
        input.limit,
    )
}
