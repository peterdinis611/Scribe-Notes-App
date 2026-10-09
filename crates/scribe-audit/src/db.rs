use rusqlite::Connection;
use std::path::{Path, PathBuf};

pub const SCHEMA_VERSION: i32 = 1;
pub const AUDIT_DB_FILE: &str = "scribe-audit.db";

pub struct AuditDb {
    pub conn: Connection,
    pub path: Option<PathBuf>,
}

pub fn open_audit_db(path: &Path) -> Result<AuditDb, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    configure(&conn)?;
    run_migrations(&conn)?;
    Ok(AuditDb {
        conn,
        path: Some(path.to_path_buf()),
    })
}

pub fn open_audit_db_memory() -> Result<AuditDb, String> {
    let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
    configure(&conn)?;
    run_migrations(&conn)?;
    Ok(AuditDb { conn, path: None })
}

fn configure(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        PRAGMA foreign_keys=ON;
        PRAGMA temp_store=MEMORY;
        "#,
    )
    .map_err(|e| e.to_string())
}

fn schema_version(conn: &Connection) -> i32 {
    conn.query_row(
        "SELECT value FROM meta WHERE key = 'schema_version'",
        [],
        |row| {
            let raw: String = row.get(0)?;
            Ok(raw.parse::<i32>().unwrap_or(0))
        },
    )
    .unwrap_or(0)
}

fn set_schema_version(conn: &Connection, version: i32) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?1)",
        [version.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn run_migrations(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )
    .map_err(|e| e.to_string())?;

    let mut current = schema_version(conn);

    if current < 1 {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS audit_events (
                id TEXT PRIMARY KEY,
                created_at INTEGER NOT NULL,
                source TEXT NOT NULL,
                category TEXT NOT NULL,
                action TEXT NOT NULL,
                actor TEXT NOT NULL DEFAULT 'local',
                resource_type TEXT,
                resource_id TEXT,
                summary TEXT NOT NULL,
                detail_json TEXT,
                outcome TEXT NOT NULL DEFAULT 'ok'
            );

            CREATE INDEX IF NOT EXISTS idx_audit_events_created
                ON audit_events(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_audit_events_category
                ON audit_events(category, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_audit_events_source
                ON audit_events(source, created_at DESC);
            "#,
        )
        .map_err(|e| e.to_string())?;
        set_schema_version(conn, 1)?;
        current = 1;
    }

    let _ = current;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_db_reaches_schema_version() {
        let db = open_audit_db_memory().unwrap();
        let version: String = db
            .conn
            .query_row(
                "SELECT value FROM meta WHERE key = 'schema_version'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION.to_string());
    }
}
