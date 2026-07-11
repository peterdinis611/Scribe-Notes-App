mod fts;
mod links;
mod migrations;
mod revisions;
pub mod search;
#[cfg(test)]
pub(crate) mod test_helpers;

pub use fts::{backfill_fts, remove_document_fts, sync_document_fts};
pub use links::{backfill_links, sync_document_links};
pub use revisions::{fetch_revision, restore_document_content, save_revision};

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
    let conn = Connection::open(&db_path)?;

    conn.execute_batch(
        r#"
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        PRAGMA foreign_keys=ON;
        PRAGMA cache_size=-64000;
        PRAGMA temp_store=MEMORY;
        PRAGMA mmap_size=268435456;
        "#,
    )
    .map_err(|e| format!("Failed to configure database: {e}"))?;

    migrations::run_migrations(&conn)?;
    migrations::seed_if_empty(&conn)?;

    Ok((conn, db_path))
}
