use crate::db::{
    search_documents_for_library, filter_search_hits, SearchFilter, SearchHit,
};

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
        library_id: library_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
    };
    let fetch = if filter.is_empty() {
        limit.unwrap_or(20)
    } else {
        (limit.unwrap_or(20) * 5).clamp(limit.unwrap_or(20), 200)
    };
    let hits = search_documents_for_library(&conn, &query, fetch, &library)?;
    Ok(filter_search_hits(&conn, hits, &filter, limit.unwrap_or(20)))
}
