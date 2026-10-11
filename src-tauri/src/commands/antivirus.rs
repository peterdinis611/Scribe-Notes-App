//! ClamAV bridge — shells out to local `clamscan` / `clamdscan` via scribe-core.
//!
//! Install on the machine: `brew install clamav && freshclam`

use crate::db::DbState;
use crate::security::PathAccessGate;
use crate::storage;
use scribe_core::file_antivirus::{
    self, AntivirusStatus, BatchScanReport, FileHealthReport, QuarantineEntry, ScanOptions,
    ScanReport, SelfTestReport, DEFAULT_SCAN_TIMEOUT_SECS,
};
use scribe_core::storage_fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, State};

fn docs_dir(app: &AppHandle, state: &State<'_, DbState>) -> Result<PathBuf, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    storage::get_documents_dir(app, &conn)
}

#[tauri::command]
pub fn antivirus_status() -> AntivirusStatus {
    file_antivirus::scanner_status()
}

#[tauri::command]
pub fn antivirus_self_test() -> SelfTestReport {
    file_antivirus::self_test()
}

#[tauri::command]
pub fn antivirus_scan_path(
    app: AppHandle,
    state: State<'_, DbState>,
    gate: State<'_, PathAccessGate>,
    path: String,
    timeout_secs: Option<u64>,
) -> Result<ScanReport, String> {
    let path_buf = PathBuf::from(&path);
    let validated = if let Ok(temp) = PathAccessGate::validate_temp_file(&path_buf) {
        temp
    } else {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        gate.validate_read(&app, &conn, &path_buf)?
    };

    let opts = ScanOptions {
        timeout: Duration::from_secs(timeout_secs.unwrap_or(DEFAULT_SCAN_TIMEOUT_SECS)),
        ..Default::default()
    };
    Ok(file_antivirus::scan_path_with(&validated, &opts))
}

#[tauri::command]
pub fn antivirus_scan_storage_file(
    app: AppHandle,
    state: State<'_, DbState>,
    path: String,
    timeout_secs: Option<u64>,
) -> Result<ScanReport, String> {
    let dir = docs_dir(&app, &state)?;
    let root = storage_fs::ensure_files_root(&dir)?;
    let abs = storage_fs::safe_join_under(&root, &path)?;
    if !abs.is_file() {
        return Err(format!("NotAFile:`{path}`"));
    }
    let opts = ScanOptions {
        timeout: Duration::from_secs(timeout_secs.unwrap_or(DEFAULT_SCAN_TIMEOUT_SECS)),
        ..Default::default()
    };
    Ok(file_antivirus::scan_path_with(&abs, &opts))
}

#[tauri::command]
pub fn antivirus_scan_storage_tree(
    app: AppHandle,
    state: State<'_, DbState>,
    path: Option<String>,
    recursive: Option<bool>,
    max_files: Option<u32>,
) -> Result<BatchScanReport, String> {
    let dir = docs_dir(&app, &state)?;
    storage_fs::scan_storage_tree(
        &dir,
        path.as_deref().unwrap_or(""),
        recursive.unwrap_or(true),
        max_files.unwrap_or(200) as usize,
    )
}

#[tauri::command]
pub fn antivirus_check_storage_health(
    app: AppHandle,
    state: State<'_, DbState>,
    path: String,
) -> Result<FileHealthReport, String> {
    let dir = docs_dir(&app, &state)?;
    storage_fs::check_file_health(&dir, &path)
}

#[tauri::command]
pub fn antivirus_quarantine_storage_file(
    app: AppHandle,
    state: State<'_, DbState>,
    path: String,
    reason: Option<String>,
    threat_name: Option<String>,
) -> Result<QuarantineEntry, String> {
    let dir = docs_dir(&app, &state)?;
    storage_fs::quarantine_storage_file(
        &dir,
        &path,
        reason.as_deref().unwrap_or("manual quarantine"),
        threat_name.as_deref(),
    )
}

#[tauri::command]
pub fn antivirus_list_quarantine(
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Vec<QuarantineEntry>, String> {
    let dir = docs_dir(&app, &state)?;
    storage_fs::list_storage_quarantine(&dir)
}

#[tauri::command]
pub fn antivirus_restore_quarantine(
    app: AppHandle,
    state: State<'_, DbState>,
    id: String,
) -> Result<String, String> {
    let dir = docs_dir(&app, &state)?;
    storage_fs::restore_storage_quarantine(&dir, &id)
}

#[tauri::command]
pub fn antivirus_purge_quarantine(
    app: AppHandle,
    state: State<'_, DbState>,
    id: String,
) -> Result<(), String> {
    let dir = docs_dir(&app, &state)?;
    storage_fs::purge_storage_quarantine(&dir, &id)
}
