use rusqlite::{params, Connection};
use serde_json::Value;

/// Collects the unique target document ids referenced by wiki-link nodes in the content.
pub fn extract_wiki_link_targets(content_json: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<Value>(content_json) else {
        return Vec::new();
    };

    let mut targets = Vec::new();
    collect_targets(&value, &mut targets);
    targets.sort();
    targets.dedup();
    targets
}

fn collect_targets(value: &Value, targets: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            if map.get("type").and_then(Value::as_str) == Some("wikiLink") {
                if let Some(target) = map
                    .get("attrs")
                    .and_then(|attrs| attrs.get("targetId"))
                    .and_then(Value::as_str)
                {
                    if !target.is_empty() {
                        targets.push(target.to_string());
                    }
                }
            }
            if let Some(content) = map.get("content") {
                collect_targets(content, targets);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_targets(item, targets);
            }
        }
        _ => {}
    }
}

/// Rebuilds the outgoing link edges for a document. Self-links and links to
/// missing documents are ignored so foreign keys stay valid.
pub fn sync_document_links(
    conn: &Connection,
    source_id: &str,
    content_json: &str,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM document_links WHERE source_id = ?1",
        params![source_id],
    )
    .map_err(|e| e.to_string())?;

    for target_id in extract_wiki_link_targets(content_json) {
        if target_id == source_id {
            continue;
        }
        conn.execute(
            "INSERT OR IGNORE INTO document_links (source_id, target_id) \
             SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM documents WHERE id = ?2)",
            params![source_id, target_id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn backfill_links(conn: &Connection) -> Result<(), String> {
    let rows: Vec<(String, String)> = {
        let mut stmt = conn
            .prepare("SELECT id, content_json FROM documents")
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        mapped.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    for (id, content_json) in rows {
        sync_document_links(conn, &id, &content_json)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::in_memory_conn;

    #[test]
    fn extracts_wiki_link_targets() {
        let json = r#"{"type":"doc","content":[
            {"type":"paragraph","content":[
                {"type":"text","text":"see "},
                {"type":"wikiLink","attrs":{"targetId":"doc-a","label":"A"}},
                {"type":"wikiLink","attrs":{"targetId":"doc-b","label":"B"}},
                {"type":"wikiLink","attrs":{"targetId":"doc-a","label":"A again"}}
            ]}
        ]}"#;
        let targets = extract_wiki_link_targets(json);
        assert_eq!(targets, vec!["doc-a".to_string(), "doc-b".to_string()]);
    }

    #[test]
    fn sync_ignores_missing_targets_and_self_links() {
        let conn = in_memory_conn();
        let now = 1i64;
        for id in ["a", "b"] {
            conn.execute(
                "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) \
                 VALUES (?1, 'T', '{}', NULL, NULL, ?2, ?2)",
                params![id, now],
            )
            .unwrap();
        }

        let content = r#"{"type":"doc","content":[
            {"type":"wikiLink","attrs":{"targetId":"b"}},
            {"type":"wikiLink","attrs":{"targetId":"missing"}},
            {"type":"wikiLink","attrs":{"targetId":"a"}}
        ]}"#;
        sync_document_links(&conn, "a", content).unwrap();

        let edges: Vec<String> = {
            let mut stmt = conn
                .prepare("SELECT target_id FROM document_links WHERE source_id = 'a' ORDER BY target_id")
                .unwrap();
            let rows = stmt.query_map([], |row| row.get::<_, String>(0)).unwrap();
            rows.collect::<Result<Vec<_>, _>>().unwrap()
        };
        assert_eq!(edges, vec!["b".to_string()]);
    }
}
