use rusqlite::{params, Connection};
use serde_json::Value;

pub fn extract_search_text(content_json: &str) -> String {
    let Ok(value) = serde_json::from_str::<Value>(content_json) else {
        return String::new();
    };

    let mut parts = Vec::new();
    collect_text(&value, &mut parts);
    parts.join(" ")
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::in_memory_conn;

    #[test]
    fn extracts_text_from_tiptap_json() {
        let json = r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Ahoj svet"}]}]}"#;
        assert_eq!(extract_search_text(json), "Ahoj svet");
    }

    #[test]
    fn sync_and_remove_round_trip() {
        let conn = in_memory_conn();
        sync_document_fts(&conn, "doc-1", "Titulok", r#"{"type":"doc","content":[]}"#).unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM documents_fts WHERE document_id = ?1",
                ["doc-1"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        remove_document_fts(&conn, "doc-1").unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM documents_fts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn backfill_indexes_existing_rows() {
        let conn = in_memory_conn();
        conn.execute(
            "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, NULL, 1, 1)",
            rusqlite::params![
                "doc-2",
                "Test",
                r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"fulltext"}]}]}"#
            ],
        )
        .unwrap();

        backfill_fts(&conn).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM documents_fts", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}
