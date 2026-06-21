use rusqlite::{params, Connection};
use uuid::Uuid;

const MAX_REVISIONS_PER_DOCUMENT: i64 = 50;

pub fn save_revision(
    conn: &Connection,
    document_id: &str,
    title: &str,
    content_json: &str,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "INSERT INTO document_revisions (id, document_id, title, content_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, document_id, title, content_json, now],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM document_revisions WHERE document_id = ?1 AND id NOT IN (
            SELECT id FROM document_revisions WHERE document_id = ?1 ORDER BY created_at DESC LIMIT ?2
        )",
        params![document_id, MAX_REVISIONS_PER_DOCUMENT],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
