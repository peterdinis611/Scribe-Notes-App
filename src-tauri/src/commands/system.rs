use crate::db::DbState;
use crate::storage::{self, FlushPendingWritesResult, ReconcileResult};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendStats {
    pub schema_version: i32,
    pub documents_count: u32,
    pub folders_count: u32,
    pub revisions_count: u32,
    pub links_count: u32,
    pub wal_enabled: bool,
    pub deferred_disk_writes: bool,
    pub db_path: String,
    pub documents_dir: String,
    pub app_version: String,
    pub pending_disk_jobs: u32,
}

#[tauri::command]
pub fn get_backend_stats(app: AppHandle, state: State<'_, DbState>) -> Result<BackendStats, String> {
    let conn = state.conn.lock().map_err(|error| error.to_string())?;

    let schema_version: i32 = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'schema_version'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);

    let documents_count: u32 = conn
        .query_row("SELECT COUNT(*) FROM documents WHERE deleted_at IS NULL", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    let folders_count: u32 = conn
        .query_row("SELECT COUNT(*) FROM folders", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    let revisions_count: u32 = conn
        .query_row("SELECT COUNT(*) FROM document_revisions", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    let links_count: u32 = conn
        .query_row("SELECT COUNT(*) FROM document_links", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;

    let wal_enabled: bool = conn
        .query_row("PRAGMA journal_mode", [], |row| {
            let mode: String = row.get(0)?;
            Ok(mode.eq_ignore_ascii_case("wal"))
        })
        .unwrap_or(false);

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("scribe.db");
    let documents_dir = storage::get_documents_dir(&app, &conn)?;

    Ok(BackendStats {
        schema_version,
        documents_count,
        folders_count,
        revisions_count,
        links_count,
        wal_enabled,
        deferred_disk_writes: true,
        db_path: db_path.to_string_lossy().to_string(),
        documents_dir: documents_dir.to_string_lossy().to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        pending_disk_jobs: state.persist_queue.pending_count(),
    })
}

#[tauri::command]
pub fn flush_pending_writes(
    state: State<'_, DbState>,
    document_id: Option<String>,
) -> Result<FlushPendingWritesResult, String> {
    crate::commands::storage::flush_document_persist(
        &state.persist_queue,
        document_id.as_deref(),
    )
}

#[tauri::command]
pub fn reconcile_storage(
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<ReconcileResult, String> {
    let conn = state.conn.lock().map_err(|error| error.to_string())?;
    storage::reconcile_storage(&app, &conn)
}
