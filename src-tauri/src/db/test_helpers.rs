use rusqlite::Connection;

use super::migrations;

pub fn in_memory_conn() -> Connection {
    let conn = Connection::open_in_memory().expect("in-memory sqlite");
    migrations::run_migrations(&conn).expect("migrations");
    conn
}
