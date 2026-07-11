use rusqlite::{params, Connection};

use super::migrations;
use super::{sync_document_fts, sync_document_links};

pub fn in_memory_conn() -> Connection {
    let conn = Connection::open_in_memory().expect("in-memory sqlite");
    migrations::run_migrations(&conn).expect("migrations");
    conn
}

pub fn seed_folder(conn: &Connection, id: &str, name: &str, parent_id: Option<&str>) {
    let now = 1_700_000_000i64;
    conn.execute(
        "INSERT INTO folders (id, name, parent_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        params![id, name, parent_id, now],
    )
    .expect("seed folder");
}

pub fn seed_document(
    conn: &Connection,
    id: &str,
    title: &str,
    content_json: &str,
    folder_id: Option<&str>,
) {
    let now = 1_700_000_000i64;
    conn.execute(
        "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5)",
        params![id, title, content_json, folder_id, now],
    )
    .expect("seed document");
    sync_document_fts(conn, id, title, content_json).expect("seed fts");
    sync_document_links(conn, id, content_json).expect("seed links");
}
