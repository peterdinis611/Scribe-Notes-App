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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_kind: Option<String>,
}

const RRF_K: f64 = 60.0;

fn rrf_score(rank: usize) -> f64 {
    1.0 / (RRF_K + rank as f64 + 1.0)
}

/// Merge FTS and semantic hits with Reciprocal Rank Fusion (same algorithm as the UI).
pub fn fuse_search_hits(
    fts_hits: &[SearchHit],
    semantic_hits: &[SearchHit],
    limit: i64,
) -> Vec<SearchHit> {
    use std::collections::HashMap;

    struct Entry {
        hit: SearchHit,
        score: f64,
        fts: bool,
        semantic: bool,
    }

    let mut merged: HashMap<String, Entry> = HashMap::new();

    for (rank, hit) in fts_hits.iter().enumerate() {
        merged.insert(
            hit.document_id.clone(),
            Entry {
                hit: SearchHit {
                    match_kind: Some("fts".to_string()),
                    ..hit.clone()
                },
                score: rrf_score(rank),
                fts: true,
                semantic: false,
            },
        );
    }

    for (rank, hit) in semantic_hits.iter().enumerate() {
        if let Some(entry) = merged.get_mut(&hit.document_id) {
            entry.score += rrf_score(rank);
            entry.semantic = true;
            if entry.hit.snippet.is_empty() && !hit.snippet.is_empty() {
                entry.hit.snippet = hit.snippet.clone();
            }
        } else {
            merged.insert(
                hit.document_id.clone(),
                Entry {
                    hit: SearchHit {
                        match_kind: Some("semantic".to_string()),
                        ..hit.clone()
                    },
                    score: rrf_score(rank),
                    fts: false,
                    semantic: true,
                },
            );
        }
    }

    let mut results: Vec<Entry> = merged.into_values().collect();
    results.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(limit.clamp(1, 50) as usize);

    results
        .into_iter()
        .map(|mut entry| {
            entry.hit.match_kind = Some(if entry.fts && entry.semantic {
                "both".to_string()
            } else if entry.semantic {
                "semantic".to_string()
            } else {
                "fts".to_string()
            });
            entry.hit.rank = -entry.score;
            entry.hit
        })
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchMode {
    Fts,
    Semantic,
    Hybrid,
}

impl SearchMode {
    pub fn parse(value: Option<&str>, nlp_enabled: bool) -> Self {
        match value {
            Some("fts") => Self::Fts,
            Some("semantic") if nlp_enabled => Self::Semantic,
            Some("semantic") => Self::Fts,
            Some("hybrid") if nlp_enabled => Self::Hybrid,
            Some("hybrid") => Self::Fts,
            _ if nlp_enabled => Self::Hybrid,
            _ => Self::Fts,
        }
    }
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
                match_kind: None,
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

    #[test]
    fn fuse_prefers_documents_in_both_lists() {
        let fts = vec![
            SearchHit {
                document_id: "a".into(),
                title: "Alpha".into(),
                snippet: String::new(),
                rank: 0.1,
                match_kind: None,
            },
            SearchHit {
                document_id: "b".into(),
                title: "Beta".into(),
                snippet: String::new(),
                rank: 0.2,
                match_kind: None,
            },
        ];
        let semantic = vec![
            SearchHit {
                document_id: "b".into(),
                title: "Beta".into(),
                snippet: String::new(),
                rank: 0.05,
                match_kind: None,
            },
            SearchHit {
                document_id: "c".into(),
                title: "Gamma".into(),
                snippet: String::new(),
                rank: 0.08,
                match_kind: None,
            },
        ];
        let fused = fuse_search_hits(&fts, &semantic, 3);
        assert_eq!(
            fused.iter().map(|hit| hit.document_id.as_str()).collect::<Vec<_>>(),
            vec!["b", "a", "c"]
        );
        assert_eq!(fused[0].match_kind.as_deref(), Some("both"));
    }
}
