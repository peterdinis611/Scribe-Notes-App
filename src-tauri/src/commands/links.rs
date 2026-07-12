use crate::db::DbState;
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkGraphEdge {
    pub source_id: String,
    pub target_id: String,
    pub source_title: String,
    pub target_title: String,
}

#[tauri::command]
pub fn list_link_graph(state: tauri::State<'_, DbState>) -> Result<Vec<LinkGraphEdge>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT l.source_id, l.target_id, s.title, t.title \
             FROM document_links l \
             JOIN documents s ON s.id = l.source_id AND s.deleted_at IS NULL \
             JOIN documents t ON t.id = l.target_id AND t.deleted_at IS NULL \
             ORDER BY s.title, t.title",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(LinkGraphEdge {
                source_id: row.get(0)?,
                target_id: row.get(1)?,
                source_title: row.get(2)?,
                target_title: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
