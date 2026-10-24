pub use scribe_core::db::*;

#[cfg(test)]
pub use scribe_core::db::test_helpers;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::storage::DiskPersistQueue;

pub struct DbState {
    pub conn: Mutex<Connection>,
    pub persist_queue: DiskPersistQueue,
}

pub fn init_db(app: &AppHandle) -> Result<(Connection, PathBuf), Box<dyn std::error::Error>> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;

    std::fs::create_dir_all(&app_dir)?;
    let db_path = app_dir.join("scribe.db");
    // Central open path for a future SQLCipher migration (`DbKey` / feature).
    let key = scribe_core::db_crypto::db_key_from_env();
    let conn = scribe_core::db_crypto::open_library_connection(&db_path, &key)
        .map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;

    scribe_core::db::migrations::run_migrations(&conn)?;
    scribe_core::db::migrations::seed_if_empty(&conn)?;

    Ok((conn, db_path))
}
