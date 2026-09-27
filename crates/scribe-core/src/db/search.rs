use rusqlite::{types::ToSql, Connection};
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
            if !hit.snippet.is_empty()
                && (entry.hit.snippet.is_empty() || hit.chunk_index.is_some())
            {
                entry.hit.snippet = hit.snippet.clone();
            }
            if entry.hit.chunk_index.is_none() {
                entry.hit.chunk_index = hit.chunk_index;
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

/// A dynamically-typed bind value for the query built in
/// `search_documents_scoped`. Using a small enum instead of `Box<dyn ToSql>`
/// keeps the optional-filter SQL building simple while still letting us bind
/// a variable number of parameters in one prepared statement.
enum SqlParam {
    Text(String),
    Int(i64),
}

impl ToSql for SqlParam {
    fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
        match self {
            SqlParam::Text(value) => value.to_sql(),
            SqlParam::Int(value) => value.to_sql(),
        }
    }
}

// Recommended indexes (create once, e.g. in a migration), so the filters
// below and the batched lookups in `fetch_document_metadata` stay sublinear
// as the `documents` table grows instead of falling back to full scans:
//
//   CREATE INDEX IF NOT EXISTS idx_documents_library_deleted
//     ON documents(library_id, deleted_at);
//   CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
//   CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at);

pub fn search_documents_in_conn(
    conn: &Connection,
    query: &str,
    limit: i64,
) -> Result<Vec<SearchHit>, String> {
    search_documents_scoped(conn, query, limit, None, &SearchFilter::default())
}

pub fn search_documents_for_library(
    conn: &Connection,
    query: &str,
    limit: i64,
    library_id: &str,
) -> Result<Vec<SearchHit>, String> {
    search_documents_scoped(conn, query, limit, Some(library_id), &SearchFilter::default())
}

/// Same search as above, but also applies `filter` (folder, tag, date range,
/// library) as part of the query. Prefer this over post-fetch filtering with
/// `filter_search_hits`: applying filters before the SQL `LIMIT` means a
/// narrow filter can no longer cause fewer than `limit` results to come back
/// just because the unfiltered top-N candidates happened not to match it.
pub fn search_documents_filtered(
    conn: &Connection,
    query: &str,
    limit: i64,
    library_id: Option<&str>,
    filter: &SearchFilter,
) -> Result<Vec<SearchHit>, String> {
    search_documents_scoped(conn, query, limit, library_id, filter)
}

fn search_documents_scoped(
    conn: &Connection,
    query: &str,
    limit: i64,
    library_id: Option<&str>,
    filter: &SearchFilter,
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

    // Tag matching can't be expressed as a plain SQL equality (tags are a
    // trimmed, comma-separated list), so when a tag filter is active we pull
    // a wider candidate pool from the DB, filter by tag in Rust, and only
    // then trim back down to `max`. Every other filter (library, folder,
    // date range) IS pushed into the SQL below, ahead of `LIMIT`, so it no
    // longer truncates relevant results before they get a chance to match.
    let fetch_cap = if filter.tag.is_some() {
        max.saturating_mul(4).clamp(1, 200)
    } else {
        max
    };

    let mut sql = String::from(
        "SELECT f.document_id, f.title, snippet(documents_fts, 2, '<mark>', '</mark>', '…', 32) AS snippet, bm25(documents_fts) AS rank
         FROM documents_fts f
         JOIN documents d ON d.id = f.document_id
         WHERE documents_fts MATCH ? AND d.deleted_at IS NULL",
    );
    let mut bind: Vec<SqlParam> = vec![SqlParam::Text(fts_query)];

    // An explicit `library_id` argument (used by `search_documents_for_library`)
    // takes precedence; falling back to `filter.library_id` lets callers of
    // `search_documents_filtered` scope by library through the filter alone.
    let effective_library = library_id
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .or_else(|| {
            filter
                .library_id
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
        });
    if let Some(lib) = effective_library {
        sql.push_str(" AND d.library_id = ?");
        bind.push(SqlParam::Text(lib.to_string()));
    }
    if let Some(folder) = filter
        .folder_id
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        sql.push_str(" AND d.folder_id = ?");
        bind.push(SqlParam::Text(folder.to_string()));
    }
    if let Some(from) = filter
        .from_date
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        if let Ok((start, _)) = crate::dates::date_key_bounds_ms(from, from) {
            sql.push_str(" AND d.updated_at >= ?");
            bind.push(SqlParam::Int(start));
        }
    }
    if let Some(to) = filter
        .to_date
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        if let Ok((_, end)) = crate::dates::date_key_bounds_ms(to, to) {
            sql.push_str(" AND d.updated_at <= ?");
            bind.push(SqlParam::Int(end));
        }
    }

    sql.push_str(" ORDER BY rank LIMIT ?");
    bind.push(SqlParam::Int(fetch_cap));

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

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

    let mut hits = stmt
        .query_map(rusqlite::params_from_iter(bind.iter()), map_hit)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    if let Some(tag) = filter.tag.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        let tag_only = SearchFilter {
            tag: Some(tag.to_string()),
            ..SearchFilter::default()
        };
        let metadata = fetch_document_metadata(conn, &hits);
        hits.retain(|hit| {
            metadata
                .get(&hit.document_id)
                .map(|meta| meta.matches(&tag_only))
                .unwrap_or(false)
        });
    }

    hits.truncate(max as usize);
    Ok(hits)
}

/// Metadata used by `filter_search_hits` / the tag-filtering step above.
struct DocMetadata {
    folder_id: Option<String>,
    tags: Vec<String>,
    updated_at: i64,
    library_id: String,
}

impl DocMetadata {
    fn matches(&self, filter: &SearchFilter) -> bool {
        if let Some(wanted) = filter
            .library_id
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            if self.library_id != wanted {
                return false;
            }
        }
        if let Some(wanted) = filter
            .folder_id
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            if self.folder_id.as_deref() != Some(wanted) {
                return false;
            }
        }
        if let Some(tag) = filter.tag.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            if !self.tags.iter().any(|existing| existing == tag) {
                return false;
            }
        }
        if let Some(from) = filter
            .from_date
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            if let Ok((start, _)) = crate::dates::date_key_bounds_ms(from, from) {
                if self.updated_at < start {
                    return false;
                }
            }
        }
        if let Some(to) = filter
            .to_date
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            if let Ok((_, end)) = crate::dates::date_key_bounds_ms(to, to) {
                if self.updated_at > end {
                    return false;
                }
            }
        }
        true
    }
}

/// Loads folder/tags/updated_at/library_id for every hit's document in a
/// single query (`id IN (...)`) instead of one round-trip per hit, which is
/// what the previous implementation did.
fn fetch_document_metadata(
    conn: &Connection,
    hits: &[SearchHit],
) -> std::collections::HashMap<String, DocMetadata> {
    use std::collections::HashMap;

    let mut out = HashMap::with_capacity(hits.len());
    if hits.is_empty() {
        return out;
    }

    let placeholders = vec!["?"; hits.len()].join(",");
    let sql = format!(
        "SELECT id, folder_id, tags, updated_at, library_id FROM documents
         WHERE id IN ({placeholders}) AND deleted_at IS NULL"
    );
    let Ok(mut stmt) = conn.prepare(&sql) else {
        return out;
    };

    let ids: Vec<String> = hits.iter().map(|hit| hit.document_id.clone()).collect();
    let rows = stmt.query_map(rusqlite::params_from_iter(ids.iter()), |row| {
        let id: String = row.get(0)?;
        let folder_id: Option<String> = row.get(1)?;
        let tags_raw: Option<String> = row.get(2)?;
        let updated_at: i64 = row.get(3)?;
        let library_id: String = row.get(4)?;
        Ok((id, folder_id, tags_raw, updated_at, library_id))
    });

    let Ok(rows) = rows else {
        return out;
    };

    for (id, folder_id, tags_raw, updated_at, library_id) in rows.flatten() {
        let tags = tags_raw
            .unwrap_or_default()
            .split(',')
            .map(|item| item.trim().to_string())
            .filter(|item| !item.is_empty())
            .collect::<Vec<_>>();
        out.insert(
            id,
            DocMetadata {
                folder_id,
                tags,
                updated_at,
                library_id,
            },
        );
    }

    out
}

/// Post-filters an already-fetched hit list against `filter`, using a single
/// batched metadata query rather than one query per hit.
///
/// Prefer `search_documents_filtered` for new call sites: it applies most of
/// these same conditions inside the SQL query itself, before `LIMIT`, which
/// this function (being a pure post-filter over whatever was already
/// fetched) cannot do.
pub fn filter_search_hits(
    conn: &Connection,
    hits: Vec<SearchHit>,
    filter: &SearchFilter,
    limit: i64,
) -> Vec<SearchHit> {
    let mut hits = hits;
    if filter.is_empty() || hits.is_empty() {
        hits.truncate(limit.clamp(1, 50) as usize);
        return hits;
    }

    let metadata = fetch_document_metadata(conn, &hits);
    hits.retain(|hit| {
        metadata
            .get(&hit.document_id)
            .map(|meta| meta.matches(filter))
            .unwrap_or(false)
    });
    hits.truncate(limit.clamp(1, 50) as usize);
    hits
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
    fn excludes_soft_deleted_documents_even_without_library_filter() {
        // Regression test: the previous "no library" query branch selected
        // straight from `documents_fts` without joining `documents`, so it
        // never checked `deleted_at` at all.
        let conn = in_memory_conn();
        crate::db::test_helpers::seed_document(&conn, "doc-live", "Live note", "{}", None);
        crate::db::test_helpers::seed_document(&conn, "doc-deleted", "Deleted note", "{}", None);
        conn.execute("UPDATE documents SET deleted_at = 1 WHERE id = 'doc-deleted'", [])
            .unwrap();

        crate::db::sync_document_fts(
            &conn,
            "doc-live",
            "Live note",
            r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"quarterly budget"}]}]}"#,
        )
        .unwrap();
        crate::db::sync_document_fts(
            &conn,
            "doc-deleted",
            "Deleted note",
            r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"quarterly budget"}]}]}"#,
        )
        .unwrap();

        let hits = search_documents_in_conn(&conn, "quarterly", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].document_id, "doc-live");
    }

    #[test]
    fn filtered_search_applies_folder_filter_in_sql_before_truncation() {
        // Regression test for the old "SQL LIMIT, then filter in Rust"
        // ordering: with a tight `limit`, filtering after the fact could
        // return zero hits even though matching documents existed, just
        // because they didn't fall inside the first `limit` FTS rows.
        let conn = in_memory_conn();
        crate::db::test_helpers::seed_folder(&conn, "f-target", "Target", None);

        for i in 0..5 {
            let id = format!("doc-{i}");
            // Put the folder-matching documents LAST so a naive
            // "LIMIT 1, then filter" approach would fetch a non-matching
            // document first and report zero results.
            let folder = if i >= 3 { Some("f-target") } else { None };
            crate::db::test_helpers::seed_document(&conn, &id, &format!("Note {i}"), "{}", folder);
            crate::db::sync_document_fts(
                &conn,
                &id,
                &format!("Note {i}"),
                r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"urgent deadline"}]}]}"#,
            )
            .unwrap();
        }

        let filter = SearchFilter {
            folder_id: Some("f-target".into()),
            ..SearchFilter::default()
        };

        let hits = search_documents_filtered(&conn, "urgent", 1, None, &filter).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].document_id == "doc-3" || hits[0].document_id == "doc-4");
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