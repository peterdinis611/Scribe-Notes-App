use rusqlite::{params, Connection};
use serde::Serialize;

fn escape_fts_token(token: &str) -> String {
    token.replace('"', "\"\"")
}

pub fn build_fts_query(query: &str) -> String {
    let tokens: Vec<String> = query
        .split_whitespace()
        .map(escape_fts_token)
        .filter(|token| !token.is_empty())
        .collect();

    if tokens.is_empty() {
        return String::new();
    }

    if tokens.len() == 1 {
        let token = &tokens[0];
        return format!("\"{token}\" OR {token}*");
    }

    let phrase = tokens.join(" ");
    let mut parts = vec![format!("\"{phrase}\"")];
    for token in tokens {
        parts.push(format!("{token}*"));
    }
    parts.join(" OR ")
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub document_id: String,
    pub title: String,
    pub snippet: String,
    pub rank: f64,
}

pub fn search_documents_in_conn(
    conn: &Connection,
    query: &str,
    limit: i64,
) -> Result<Vec<SearchHit>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    let max = limit.clamp(1, 50);
    let fts_query = build_fts_query(q);
    if fts_query.is_empty() {
        return Ok(Vec::new());
    }

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::in_memory_conn;

    #[test]
    fn returns_empty_for_blank_query() {
        let conn = in_memory_conn();
        let hits = search_documents_in_conn(&conn, "   ", 10).unwrap();
        assert!(hits.is_empty());
    }

    #[test]
    fn escapes_quotes_in_query() {
        assert_eq!(
            build_fts_query(r#"foo" bar"#),
            r#""foo"" bar" OR foo""* OR bar*"#
        );
    }

    #[test]
    fn builds_multi_word_query() {
        assert_eq!(
            build_fts_query("dôležitý termín"),
            "\"dôležitý termín\" OR dôležitý* OR termín*"
        );
    }

    #[test]
    fn finds_document_by_title_and_body() {
        let conn = in_memory_conn();
        crate::db::sync_document_fts(
            &conn,
            "doc-1",
            "Poznámky zo stretnutia",
            r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Dôležitý termín v marci"}]}]}"#,
        )
        .unwrap();

        let hits = search_documents_in_conn(&conn, "marci", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].document_id, "doc-1");
        assert!(hits[0].title.contains("Poznámky"));
    }
}
