use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

use crate::db::extract_search_text;

use super::types::{OrphanDocument, StubDocument, UnresolvedWikiLink, WikiHealth};

fn word_count_plain(text: &str) -> i64 {
    text.split_whitespace().filter(|part| !part.is_empty()).count() as i64
}

fn collect_unresolved_wiki(
    conn: &Connection,
    document_id: &str,
    document_title: &str,
    content_json: &str,
    out: &mut Vec<UnresolvedWikiLink>,
    max: i64,
) -> Result<(), String> {
    let Ok(value) = serde_json::from_str::<Value>(content_json) else {
        return Ok(());
    };
    walk_unresolved_wiki(conn, document_id, document_title, &value, out, max)
}

fn walk_unresolved_wiki(
    conn: &Connection,
    document_id: &str,
    document_title: &str,
    value: &Value,
    out: &mut Vec<UnresolvedWikiLink>,
    max: i64,
) -> Result<(), String> {
    if out.len() as i64 >= max {
        return Ok(());
    }
    if value.get("type").and_then(Value::as_str) == Some("wikiLink") {
        let label = value
            .pointer("/attrs/label")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        let target_id = value
            .pointer("/attrs/targetId")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_string);
        let resolved = if let Some(target_id) = target_id.as_deref() {
            let exists: Option<String> = conn
                .query_row(
                    "SELECT id FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                    params![target_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            exists.is_some()
        } else {
            false
        };
        if !resolved && !label.is_empty() {
            out.push(UnresolvedWikiLink {
                document_id: document_id.to_string(),
                document_title: document_title.to_string(),
                label,
                target_id,
                suggestions: Vec::new(),
            });
        }
    }
    if let Some(content) = value.get("content").and_then(Value::as_array) {
        for child in content {
            walk_unresolved_wiki(conn, document_id, document_title, child, out, max)?;
            if out.len() as i64 >= max {
                break;
            }
        }
    }
    Ok(())
}

/// Wiki links whose target is missing or points at a deleted document.
pub fn list_unresolved_wiki_links(
    conn: &Connection,
    limit: i64,
) -> Result<Vec<UnresolvedWikiLink>, String> {
    let max = limit.clamp(1, 500);
    let mut stmt = conn
        .prepare(
            "SELECT id, title, content_json FROM documents
             WHERE deleted_at IS NULL
             ORDER BY updated_at DESC",
        )
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

    let mut unresolved = Vec::new();
    for row in rows {
        if unresolved.len() as i64 >= max {
            break;
        }
        let (document_id, document_title, content_json) = row.map_err(|e| e.to_string())?;
        collect_unresolved_wiki(
            conn,
            &document_id,
            &document_title,
            &content_json,
            &mut unresolved,
            max,
        )?;
    }
    super::resolve::attach_link_suggestions(conn, &mut unresolved)?;
    Ok(unresolved)
}

/// Very short notes (body word count at or below `max_words`).
pub fn list_stub_documents(
    conn: &Connection,
    max_words: i64,
    limit: i64,
) -> Result<Vec<StubDocument>, String> {
    let max_words = max_words.clamp(1, 200);
    let max = limit.clamp(1, 500);
    let mut stmt = conn
        .prepare(
            "SELECT id, title, content_json FROM documents
             WHERE deleted_at IS NULL
             ORDER BY updated_at DESC",
        )
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

    let mut stubs = Vec::new();
    for row in rows {
        if stubs.len() as i64 >= max {
            break;
        }
        let (id, title, content_json) = row.map_err(|e| e.to_string())?;
        let body = extract_search_text(&content_json);
        let word_count = word_count_plain(&body);
        if word_count <= max_words {
            stubs.push(StubDocument {
                id,
                title,
                word_count,
            });
        }
    }
    stubs.sort_by(|a, b| {
        a.word_count
            .cmp(&b.word_count)
            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
    });
    Ok(stubs)
}

/// Notes with no incoming or outgoing wiki edges.
pub(crate) fn list_orphan_documents_limited(
    conn: &Connection,
    limit: i64,
) -> Result<Vec<OrphanDocument>, String> {
    let max = limit.clamp(1, 2_000);
    let mut orphan_stmt = conn
        .prepare(
            "SELECT d.id, d.title FROM documents d
             WHERE d.deleted_at IS NULL
               AND d.id NOT IN (SELECT source_id FROM document_links)
               AND d.id NOT IN (SELECT target_id FROM document_links)
             ORDER BY d.title COLLATE NOCASE
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let orphans = orphan_stmt
        .query_map(params![max], |row| {
            Ok(OrphanDocument {
                id: row.get(0)?,
                title: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(orphans)
}

/// Orphans + unresolved wiki links + stub notes for the library panel.
pub fn wiki_health(
    conn: &Connection,
    unresolved_limit: i64,
    stub_max_words: i64,
    stub_limit: i64,
) -> Result<WikiHealth, String> {
    Ok(WikiHealth {
        orphans: list_orphan_documents_limited(conn, 500)?,
        unresolved: list_unresolved_wiki_links(conn, unresolved_limit)?,
        stubs: list_stub_documents(conn, stub_max_words, stub_limit)?,
    })
}
