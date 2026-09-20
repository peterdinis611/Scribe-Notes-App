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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chunk_index: Option<i32>,
}

#[derive(Debug, Clone, Default)]
pub struct SearchFilter {
    pub folder_id: Option<String>,
    pub tag: Option<String>,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub library_id: Option<String>,
}

impl SearchFilter {
    pub fn is_empty(&self) -> bool {
        option_blank(&self.folder_id)
            && option_blank(&self.tag)
            && option_blank(&self.from_date)
            && option_blank(&self.to_date)
            && option_blank(&self.library_id)
    }
}

fn option_blank(value: &Option<String>) -> bool {
    value
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .is_empty()
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
    search_documents_scoped(conn, query, limit, None)
}

pub fn search_documents_for_library(
    conn: &Connection,
    query: &str,
    limit: i64,
    library_id: &str,
) -> Result<Vec<SearchHit>, String> {
    search_documents_scoped(conn, query, limit, Some(library_id))
}

fn search_documents_scoped(
    conn: &Connection,
    query: &str,
    limit: i64,
    library_id: Option<&str>,
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

    let sql = if library_id.is_some() {
        "SELECT f.document_id, f.title, snippet(documents_fts, 2, '<mark>', '</mark>', '…', 32) AS snippet, bm25(documents_fts) AS rank
             FROM documents_fts f
             JOIN documents d ON d.id = f.document_id
             WHERE documents_fts MATCH ?1 AND d.deleted_at IS NULL AND d.library_id = ?3
             ORDER BY rank
             LIMIT ?2"
    } else {
        "SELECT document_id, title, snippet(documents_fts, 2, '<mark>', '</mark>', '…', 32) AS snippet, bm25(documents_fts) AS rank
             FROM documents_fts
             WHERE documents_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let map_hit = |row: &rusqlite::Row<'_>| {
        Ok(SearchHit {
            document_id: row.get(0)?,
            title: row.get(1)?,
            snippet: row.get(2)?,
            rank: row.get(3)?,
            match_kind: None,
            chunk_index: None,
        })
    };

    let rows = if let Some(library_id) = library_id {
        stmt.query_map(params![fts_query, max, library_id], map_hit)
            .map_err(|e| e.to_string())?
    } else {
        stmt.query_map(params![fts_query, max], map_hit)
            .map_err(|e| e.to_string())?
    };

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn filter_search_hits(
    conn: &Connection,
    mut hits: Vec<SearchHit>,
    filter: &SearchFilter,
    limit: i64,
) -> Vec<SearchHit> {
    if !filter.is_empty() {
        hits.retain(|hit| hit_matches_filter(conn, hit, filter));
    }
    hits.truncate(limit.clamp(1, 50) as usize);
    hits
}

fn hit_matches_filter(conn: &Connection, hit: &SearchHit, filter: &SearchFilter) -> bool {
    use rusqlite::OptionalExtension;

    let row: Option<(Option<String>, Option<String>, i64, String)> = conn
        .query_row(
            "SELECT folder_id, tags, updated_at, library_id FROM documents
             WHERE id = ?1 AND deleted_at IS NULL",
            params![hit.document_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .ok()
        .flatten();
    let Some((folder_id, tags_raw, updated_at, library_id)) = row else {
        return false;
    };
    if let Some(wanted) = filter.library_id.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        if library_id != wanted {
            return false;
        }
    };
    if let Some(wanted) = filter.folder_id.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        if folder_id.as_deref() != Some(wanted) {
            return false;
        }
    }
    if let Some(tag) = filter.tag.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        let tags = tags_raw
            .unwrap_or_default()
            .split(',')
            .map(|item| item.trim().to_string())
            .filter(|item| !item.is_empty())
            .collect::<Vec<_>>();
        if !tags.iter().any(|existing| existing == tag) {
            return false;
        }
    }
    if let Some(from) = filter.from_date.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        if let Ok((start, _)) = crate::dates::date_key_bounds_ms(from, from) {
            if updated_at < start {
                return false;
            }
        }
    }
    if let Some(to) = filter.to_date.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        if let Ok((_, end)) = crate::dates::date_key_bounds_ms(to, to) {
            if updated_at > end {
                return false;
            }
        }
    }
    true
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
    fn library_search_excludes_other_libraries() {
        let conn = in_memory_conn();
        let now = 1_700_000_000i64;
        conn.execute(
            "INSERT INTO documents (id, title, content_json, created_at, updated_at, library_id)
             VALUES ('doc-work', 'Work note', '{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"alpha secret\"}]}]}', ?1, ?1, 'work')",
            rusqlite::params![now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO documents (id, title, content_json, created_at, updated_at, library_id)
             VALUES ('doc-home', 'Home note', '{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"alpha secret\"}]}]}', ?1, ?1, 'home')",
            rusqlite::params![now],
        )
        .unwrap();
        crate::db::sync_document_fts(
            &conn,
            "doc-work",
            "Work note",
            r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"alpha secret"}]}]}"#,
        )
        .unwrap();
        crate::db::sync_document_fts(
            &conn,
            "doc-home",
            "Home note",
            r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"alpha secret"}]}]}"#,
        )
        .unwrap();

        let work = search_documents_for_library(&conn, "alpha", 10, "work").unwrap();
        assert_eq!(work.len(), 1);
        assert_eq!(work[0].document_id, "doc-work");
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
                chunk_index: None,
            },
            SearchHit {
                document_id: "b".into(),
                title: "Beta".into(),
                snippet: String::new(),
                rank: 0.2,
                match_kind: None,
                chunk_index: None,
            },
        ];
        let semantic = vec![
            SearchHit {
                document_id: "b".into(),
                title: "Beta".into(),
                snippet: String::new(),
                rank: 0.05,
                match_kind: None,
                chunk_index: None,
            },
            SearchHit {
                document_id: "c".into(),
                title: "Gamma".into(),
                snippet: String::new(),
                rank: 0.08,
                match_kind: None,
                chunk_index: None,
            },
        ];
        let fused = fuse_search_hits(&fts, &semantic, 3);
        assert_eq!(
            fused.iter().map(|hit| hit.document_id.as_str()).collect::<Vec<_>>(),
            vec!["b", "a", "c"]
        );
        assert_eq!(fused[0].match_kind.as_deref(), Some("both"));
    }

    #[test]
    fn filter_hits_by_folder_tag_and_library() {
        let conn = in_memory_conn();
        crate::db::test_helpers::seed_folder(&conn, "f-work", "Work", None);
        crate::db::test_helpers::seed_document(&conn, "doc-a", "Alpha", "{}", Some("f-work"));
        crate::db::test_helpers::seed_document(&conn, "doc-b", "Beta", "{}", None);
        conn.execute("UPDATE documents SET tags = 'inbox', library_id = 'work' WHERE id = 'doc-a'", [])
            .unwrap();
        conn.execute("UPDATE documents SET tags = 'other', library_id = 'home' WHERE id = 'doc-b'", [])
            .unwrap();
        let hits = vec![
            SearchHit {
                document_id: "doc-a".into(),
                title: "Alpha".into(),
                snippet: String::new(),
                rank: 0.0,
                match_kind: None,
                chunk_index: None,
            },
            SearchHit {
                document_id: "doc-b".into(),
                title: "Beta".into(),
                snippet: String::new(),
                rank: 0.0,
                match_kind: None,
                chunk_index: None,
            },
        ];
        let folder = filter_search_hits(
            &conn,
            hits.clone(),
            &SearchFilter {
                folder_id: Some("f-work".into()),
                ..SearchFilter::default()
            },
            10,
        );
        assert_eq!(folder.len(), 1);
        assert_eq!(folder[0].document_id, "doc-a");

        let tagged = filter_search_hits(
            &conn,
            hits.clone(),
            &SearchFilter {
                tag: Some("inbox".into()),
                ..SearchFilter::default()
            },
            10,
        );
        assert_eq!(tagged.len(), 1);

        let library = filter_search_hits(
            &conn,
            hits,
            &SearchFilter {
                library_id: Some("home".into()),
                ..SearchFilter::default()
            },
            10,
        );
        assert_eq!(library.len(), 1);
        assert_eq!(library[0].document_id, "doc-b");
    }
}
