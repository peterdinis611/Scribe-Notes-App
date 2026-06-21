use crate::db::DbState;
use tauri::State;

pub use crate::db::search::{search_documents_in_conn, SearchHit};

#[tauri::command]
pub fn search_documents(
    state: State<'_, DbState>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<SearchHit>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    search_documents_in_conn(&conn, &query, limit.unwrap_or(20))
}
