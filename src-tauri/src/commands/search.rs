use crate::db::{search_documents_filtered, SearchFilter, SearchHit, DbState};
use tauri::State;

#[tauri::command]
pub fn search_documents(
    state: State<'_, DbState>,
    query: String,
    limit: Option<i64>,
    folder_id: Option<String>,
    tag: Option<String>,
    from_date: Option<String>,
    to_date: Option<String>,
    library_id: Option<String>,
) -> Result<Vec<SearchHit>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let active_library = crate::libraries::active_library_id(&conn);
    let library = library_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(active_library.as_str())
        .to_string();
    let filter = SearchFilter {
        folder_id,
        tag,
        from_date,
        to_date,
        library_id: None,
    };
    search_documents_filtered(
        &conn,
        &query,
        limit.unwrap_or(20),
        Some(&library),
        &filter,
    )
}
