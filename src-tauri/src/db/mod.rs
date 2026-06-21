mod fts;
mod migrations;
mod revisions;

pub use fts::{backfill_fts, remove_document_fts, sync_document_fts};

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct DbState {
    pub conn: Mutex<Connection>,
}

pub fn init_db(app: &AppHandle) -> Result<Connection, Box<dyn std::error::Error>> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;

    std::fs::create_dir_all(&app_dir)?;
    let db_path = app_dir.join("scribe.db");
    let conn = Connection::open(db_path)?;

    migrations::run_migrations(&conn)?;
    migrations::seed_if_empty(&conn)?;

    Ok(conn)
}
