use crate::db::DbState;
use tauri::State;

pub use crate::db::{search_documents_for_library, SearchHit};

#[tauri::command]
pub fn search_documents(
    state: State<'_, DbState>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<SearchHit>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let library_id = crate::libraries::active_library_id(&conn);
    search_documents_for_library(&conn, &query, limit.unwrap_or(20), &library_id)
}
