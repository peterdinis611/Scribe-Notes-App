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
