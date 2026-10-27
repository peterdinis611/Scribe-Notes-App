//! Active-library spine shared by store, MCP, and Tauri.

use rusqlite::{params, Connection, OptionalExtension};

pub const DEFAULT_LIBRARY_ID: &str = "default";
pub const META_ACTIVE_LIBRARY: &str = "active_library_id";

pub fn active_library_id(conn: &Connection) -> String {
    conn.query_row(
        "SELECT value FROM meta WHERE key = ?1",
        [META_ACTIVE_LIBRARY],
        |row| row.get(0),
    )
    .unwrap_or_else(|_| DEFAULT_LIBRARY_ID.to_string())
}

/// Persist the active library id (does not validate existence — call [`require_library_id`] first).
pub fn set_active_library_id(conn: &Connection, library_id: &str) -> Result<(), String> {
    let id = library_id.trim();
    if id.is_empty() {
        return Err("library_id is required".into());
    }
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
        params![META_ACTIVE_LIBRARY, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Ensure a library row exists; returns the normalized id.
pub fn require_library_id(conn: &Connection, library_id: &str) -> Result<String, String> {
    let id = library_id.trim();
    if id.is_empty() {
        return Err("library_id is required".into());
    }
    let found: Option<String> = conn
        .query_row(
            "SELECT id FROM libraries WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    found.ok_or_else(|| format!("Library not found: {id}"))
}

/// `COALESCE(library_id, 'default') = ?` fragment for documents / folders / etc.
pub fn scoped_library_equals_sql(column: &str) -> String {
    format!("COALESCE({column}, '{DEFAULT_LIBRARY_ID}') = ?")
}

/// True when the folder belongs to `library_id` (or library is missing → treated as default).
pub fn folder_belongs_to_library(
    conn: &Connection,
    folder_id: &str,
    library_id: &str,
) -> Result<bool, String> {
    let found: Option<String> = conn
        .query_row(
            "SELECT id FROM folders \
             WHERE id = ?1 AND COALESCE(library_id, 'default') = ?2",
            params![folder_id, library_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(found.is_some())
}

/// Require folder exists in the active library.
pub fn require_folder_in_active_library(
    conn: &Connection,
    folder_id: &str,
) -> Result<(), String> {
    let library_id = active_library_id(conn);
    if folder_belongs_to_library(conn, folder_id, &library_id)? {
        Ok(())
    } else {
        Err(format!("Folder not found in active library: {folder_id}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::in_memory_conn;

    #[test]
    fn defaults_to_seeded_library() {
        let conn = in_memory_conn();
        assert_eq!(active_library_id(&conn), DEFAULT_LIBRARY_ID);
    }

    #[test]
    fn reads_meta_override() {
        let conn = in_memory_conn();
        conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
            rusqlite::params![META_ACTIVE_LIBRARY, "work"],
        )
        .unwrap();
        assert_eq!(active_library_id(&conn), "work");
    }

    #[test]
    fn missing_meta_falls_back_to_default() {
        let conn = in_memory_conn();
        conn.execute("DELETE FROM meta WHERE key = ?1", [META_ACTIVE_LIBRARY])
            .unwrap();
        assert_eq!(active_library_id(&conn), DEFAULT_LIBRARY_ID);
    }

    #[test]
    fn set_and_require_roundtrip() {
        let conn = in_memory_conn();
        conn.execute(
            "INSERT INTO libraries (id, name, root_path, created_at, last_opened_at, sort_order) \
             VALUES ('work', 'Work', '', 1, 1, 1)",
            [],
        )
        .unwrap();
        require_library_id(&conn, "work").unwrap();
        set_active_library_id(&conn, "work").unwrap();
        assert_eq!(active_library_id(&conn), "work");
        assert!(require_library_id(&conn, "missing").is_err());
    }

    #[test]
    fn folder_scope_checks_library() {
        let conn = in_memory_conn();
        conn.execute(
            "INSERT INTO folders (id, name, parent_id, created_at, updated_at, library_id) \
             VALUES ('f1', 'A', NULL, 1, 1, 'default')",
            [],
        )
        .unwrap();
        assert!(folder_belongs_to_library(&conn, "f1", "default").unwrap());
        assert!(!folder_belongs_to_library(&conn, "f1", "other").unwrap());
        require_folder_in_active_library(&conn, "f1").unwrap();
    }
}
