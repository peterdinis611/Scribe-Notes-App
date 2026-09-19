use rusqlite::Connection;

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
}
