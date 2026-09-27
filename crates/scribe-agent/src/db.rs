use rusqlite::Connection;
use std::path::{Path, PathBuf};

pub const SCHEMA_VERSION: i32 = 1;
pub const AGENT_DB_FILE: &str = "scribe-agent.db";

pub struct AgentDb {
    pub conn: Connection,
    pub path: Option<PathBuf>,
}

pub fn open_agent_db(path: &Path) -> Result<AgentDb, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    configure(&conn)?;
    run_migrations(&conn)?;
    Ok(AgentDb {
        conn,
        path: Some(path.to_path_buf()),
    })
}

pub fn open_agent_db_memory() -> Result<AgentDb, String> {
    let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
    configure(&conn)?;
    run_migrations(&conn)?;
    Ok(AgentDb { conn, path: None })
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

    let current: i32 = conn
        .query_row(
            "SELECT value FROM meta WHERE key = 'schema_version'",
            [],
            |row| {
                let raw: String = row.get(0)?;
                Ok(raw.parse::<i32>().unwrap_or(0))
            },
        )
        .unwrap_or(0);

    if current < 1 {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS agent_prefs (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                enabled INTEGER NOT NULL DEFAULT 1,
                max_steps INTEGER NOT NULL DEFAULT 3,
                prefer_fast INTEGER NOT NULL DEFAULT 0,
                preferred_tools_json TEXT NOT NULL DEFAULT '[]',
                disabled_tools_json TEXT NOT NULL DEFAULT '[]',
                updated_at INTEGER NOT NULL
            );

            INSERT OR IGNORE INTO agent_prefs
                (id, enabled, max_steps, prefer_fast, preferred_tools_json, disabled_tools_json, updated_at)
            VALUES (1, 1, 3, 0, '[]', '[]', 0);

            CREATE TABLE IF NOT EXISTS agent_teachings (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_agent_teachings_created
                ON agent_teachings(created_at DESC);

            CREATE TABLE IF NOT EXISTS agent_runs (
                id TEXT PRIMARY KEY,
                scope TEXT NOT NULL,
                document_id TEXT,
                goal TEXT NOT NULL,
                steps_json TEXT,
                answer TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_agent_runs_created
                ON agent_runs(created_at DESC);
            "#,
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?1)",
            [SCHEMA_VERSION.to_string()],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_db_reaches_schema_version() {
        let db = open_agent_db_memory().unwrap();
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
