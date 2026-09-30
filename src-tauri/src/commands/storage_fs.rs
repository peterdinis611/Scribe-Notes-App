use crate::db::DbState;
use crate::security::PathAccessGate;
use crate::storage;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use scribe_core::storage_fs::{
    absolute_path, delete, list, mkdir, read_file, rename, stat, write_file, ListOpts, StorageEntry,
};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageFsListArgs {
    pub path: Option<String>,
    pub recursive: Option<bool>,
    pub depth: Option<u32>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageFsPathArgs {
    pub path: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageFsWriteArgs {
    pub path: String,
    pub data_base64: String,
    pub overwrite: Option<bool>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageFsDeleteArgs {
    pub path: String,
    pub recursive: Option<bool>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageFsRenameArgs {
    pub from: String,
    pub to: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageFsReadResult {
    pub path: String,
    pub data_base64: String,
    pub size_bytes: u64,
}

fn documents_dir(app: &AppHandle, state: &State<'_, DbState>) -> Result<std::path::PathBuf, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    storage::get_documents_dir(app, &conn)
}

fn decode_base64(data_base64: &str) -> Result<Vec<u8>, String> {
    let payload = data_base64
        .split_once(',')
        .map(|(_, data)| data)
        .unwrap_or(data_base64);
    STANDARD
        .decode(payload)
        .map_err(|e| format!("Invalid base64: {e}"))
}

#[tauri::command]
pub fn storage_fs_list(
    app: AppHandle,
    state: State<'_, DbState>,
    input: StorageFsListArgs,
) -> Result<Vec<StorageEntry>, String> {
    let dir = documents_dir(&app, &state)?;
    list(
        &dir,
        ListOpts {
            path: input.path,
            recursive: input.recursive.unwrap_or(false),
            depth: input.depth,
        },
    )
}

#[tauri::command]
pub fn storage_fs_stat(
    app: AppHandle,
    state: State<'_, DbState>,
    input: StorageFsPathArgs,
) -> Result<StorageEntry, String> {
    let dir = documents_dir(&app, &state)?;
    stat(&dir, &input.path)
}

#[tauri::command]
pub fn storage_fs_mkdir(
    app: AppHandle,
    state: State<'_, DbState>,
    input: StorageFsPathArgs,
) -> Result<StorageEntry, String> {
    let dir = documents_dir(&app, &state)?;
    mkdir(&dir, &input.path)
}

#[tauri::command]
pub fn storage_fs_write(
    app: AppHandle,
    state: State<'_, DbState>,
    input: StorageFsWriteArgs,
) -> Result<StorageEntry, String> {
    let dir = documents_dir(&app, &state)?;
    let bytes = decode_base64(&input.data_base64)?;
    write_file(&dir, &input.path, &bytes, input.overwrite.unwrap_or(false))
}

#[tauri::command]
pub fn storage_fs_read(
    app: AppHandle,
    state: State<'_, DbState>,
    input: StorageFsPathArgs,
) -> Result<StorageFsReadResult, String> {
    let dir = documents_dir(&app, &state)?;
    let bytes = read_file(&dir, &input.path)?;
    Ok(StorageFsReadResult {
        path: input.path,
        size_bytes: bytes.len() as u64,
        data_base64: STANDARD.encode(&bytes),
    })
}

#[tauri::command]
pub fn storage_fs_delete(
    app: AppHandle,
    state: State<'_, DbState>,
    input: StorageFsDeleteArgs,
) -> Result<(), String> {
    let dir = documents_dir(&app, &state)?;
    delete(&dir, &input.path, input.recursive.unwrap_or(false))
}

#[tauri::command]
pub fn storage_fs_rename(
    app: AppHandle,
    state: State<'_, DbState>,
    input: StorageFsRenameArgs,
) -> Result<StorageEntry, String> {
    let dir = documents_dir(&app, &state)?;
    rename(&dir, &input.from, &input.to)
}

#[tauri::command]
pub fn storage_fs_reveal(
    app: AppHandle,
    state: State<'_, DbState>,
    gate: State<'_, PathAccessGate>,
    input: StorageFsPathArgs,
) -> Result<(), String> {
    let dir = documents_dir(&app, &state)?;
    let abs = absolute_path(&dir, &input.path)?;
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let validated = gate.validate_reveal(&app, &conn, &abs)?;
    drop(conn);

    app.opener()
        .reveal_item_in_dir(validated.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}
