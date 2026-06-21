use rusqlite::{params, Connection};
use serde_json::Value;

pub fn extract_search_text(content_json: &str) -> String {
    let Ok(value) = serde_json::from_str::<Value>(content_json) else {
        return String::new();
    };

    let mut parts = Vec::new();
    collect_text(&value, &mut parts);
    parts.join(' ')
}

fn collect_text(value: &Value, parts: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            if let Some(Value::String(text)) = map.get("text") {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    parts.push(trimmed.to_string());
                }
            }
            if let Some(content) = map.get("content") {
                collect_text(content, parts);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_text(item, parts);
            }
        }
        _ => {}
    }
}

pub fn sync_document_fts(
    conn: &Connection,
    document_id: &str,
    title: &str,
    content_json: &str,
) -> Result<(), String> {
    let body = extract_search_text(content_json);
    conn.execute(
        "DELETE FROM documents_fts WHERE document_id = ?1",
        params![document_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO documents_fts (document_id, title, body) VALUES (?1, ?2, ?3)",
        params![document_id, title, body],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn remove_document_fts(conn: &Connection, document_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM documents_fts WHERE document_id = ?1",
        params![document_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn backfill_fts(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT id, title, content_json FROM documents")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (id, title, content_json) = row.map_err(|e| e.to_string())?;
        sync_document_fts(conn, &id, &title, &content_json)?;
    }

    Ok(())
}
