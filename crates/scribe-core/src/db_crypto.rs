//! At-rest DB encryption helpers (SQLCipher foundation).
//!
//! Today the library opens plaintext SQLite. This module centralizes open +
//! optional `PRAGMA key` so a future SQLCipher migration has one call site.
//!
//! Enable with feature `sqlcipher` on `scribe-core` (and matching rusqlite
//! features on dependents). Without the feature, `DbKey::None` is the only
//! supported mode and the DB stays plaintext.

use rusqlite::{Connection, OpenFlags};
use std::path::Path;

/// Key material for an encrypted database. Never log or put in JS.
#[derive(Debug, Clone)]
pub enum DbKey {
    /// Plaintext SQLite (current default).
    None,
    /// Passphrase / raw key for SQLCipher `PRAGMA key`.
    #[cfg(feature = "sqlcipher")]
    Passphrase(String),
}

impl Default for DbKey {
    fn default() -> Self {
        Self::None
    }
}

/// Open a SQLite DB and apply standard Scribe pragmas (+ optional SQLCipher key).
pub fn open_library_connection(path: &Path, key: &DbKey) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("open {}: {e}", path.display()))?;
    apply_key(&conn, key)?;
    apply_runtime_pragmas(&conn)?;
    Ok(conn)
}

/// Open read-only (MCP / concurrent readers).
pub fn open_library_connection_readonly(path: &Path, key: &DbKey) -> Result<Connection, String> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("open readonly {}: {e}", path.display()))?;
    apply_key(&conn, key)?;
    // WAL/mmap pragmas are less relevant for readonly; keep foreign_keys.
    conn.execute_batch("PRAGMA foreign_keys=ON;")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn apply_key(conn: &Connection, key: &DbKey) -> Result<(), String> {
    match key {
        DbKey::None => {
            let _ = conn;
            Ok(())
        }
        #[cfg(feature = "sqlcipher")]
        DbKey::Passphrase(passphrase) => {
            // Must run before any other statement on an encrypted DB.
            conn.pragma_update(None, "key", passphrase)
                .map_err(|e| format!("SQLCipher PRAGMA key failed: {e}"))?;
            // Fail fast if the key is wrong / file is not SQLCipher.
            conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0))
                .map_err(|e| format!("SQLCipher key rejected or DB corrupt: {e}"))?;
            Ok(())
        }
    }
}

fn apply_runtime_pragmas(conn: &Connection) -> Result<(), String> {
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
    .map_err(|e| format!("Failed to configure database: {e}"))
}

/// Resolve key from env for tooling (MCP). App UI should use keychain later.
///
/// - unset / empty → [`DbKey::None`]
/// - `SCRIBE_DB_KEY` → passphrase when `sqlcipher` feature is on
pub fn db_key_from_env() -> DbKey {
    #[cfg(feature = "sqlcipher")]
    {
        match std::env::var("SCRIBE_DB_KEY") {
            Ok(value) if !value.is_empty() => DbKey::Passphrase(value),
            _ => DbKey::None,
        }
    }
    #[cfg(not(feature = "sqlcipher"))]
    {
        DbKey::None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_plaintext_roundtrip() {
        let dir = std::env::temp_dir().join(format!("scribe-db-crypto-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.db");
        let conn = open_library_connection(&path, &DbKey::None).unwrap();
        conn.execute_batch("CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (1);")
            .unwrap();
        drop(conn);
        let conn = open_library_connection_readonly(&path, &DbKey::None).unwrap();
        let n: i64 = conn
            .query_row("SELECT id FROM t", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
