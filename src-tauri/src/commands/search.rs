use crate::db::DbState;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub document_id: String,
    pub title: String,
    pub snippet: String,
    pub rank: f64,
}

#[tauri::command]
pub fn search_documents(
    state: State<'_, DbState>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<SearchHit>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let max = limit.unwrap_or(20).clamp(1, 50);
    let fts_query = format!("\"{q}\" OR {q}*");

    let mut stmt = conn
        .prepare(
            "SELECT document_id, title, snippet(documents_fts, 2, '<mark>', '</mark>', '…', 32) AS snippet, bm25(documents_fts) AS rank
             FROM documents_fts
             WHERE documents_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![fts_query, max], |row| {
            Ok(SearchHit {
                document_id: row.get(0)?,
                title: row.get(1)?,
                snippet: row.get(2)?,
                rank: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
