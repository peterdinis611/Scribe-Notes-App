use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

use crate::db::{sync_document_fts, sync_document_links};
use crate::enhance::fuzzy_extract;
use crate::vault::content_is_vault_cipher;

use super::types::{ResolveWikiLinkResult, TitleMatch, UnresolvedWikiLink};

/// Title search with LIKE first, then rapidfuzz fallback (when `fuzzy` feature is on).
pub fn find_documents_by_title(
    conn: &Connection,
    title_query: &str,
    limit: i64,
) -> Result<Vec<TitleMatch>, String> {
    let q = title_query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    let max = limit.clamp(1, 50) as usize;
    let pattern = format!("%{q}%");
    let prefix = format!("{q}%");

    let mut stmt = conn
        .prepare(
            "SELECT id, title FROM documents
             WHERE deleted_at IS NULL AND title LIKE ?1 COLLATE NOCASE
             ORDER BY
               CASE WHEN title = ?2 COLLATE NOCASE THEN 0
                    WHEN title LIKE ?3 COLLATE NOCASE THEN 1
                    ELSE 2 END,
               updated_at DESC
             LIMIT ?4",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![pattern, q, prefix, max as i64], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut hits: Vec<TitleMatch> = Vec::new();
    for row in rows {
        let (id, title) = row.map_err(|e| e.to_string())?;
        let score = if title.eq_ignore_ascii_case(q) {
            1.0
        } else if title.to_lowercase().starts_with(&q.to_lowercase()) {
            0.92
        } else {
            0.8
        };
        hits.push(TitleMatch { id, title, score });
    }

    if hits.is_empty() {
        let mut cand_stmt = conn
            .prepare(
                "SELECT id, title FROM documents
                 WHERE deleted_at IS NULL
                 ORDER BY updated_at DESC
                 LIMIT 200",
            )
            .map_err(|e| e.to_string())?;
        let candidates = cand_stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let titles: Vec<String> = candidates.iter().map(|(_, t)| t.clone()).collect();
        for (title, score) in fuzzy_extract(q, &titles, max, 0.78) {
            if let Some((id, _)) = candidates.iter().find(|(_, t)| t == &title) {
                hits.push(TitleMatch {
                    id: id.clone(),
                    title,
                    score,
                });
            }
        }
    }

    Ok(hits)
}

/// Attach up to 3 near-title suggestions per unresolved link.
pub fn attach_link_suggestions(
    conn: &Connection,
    unresolved: &mut [UnresolvedWikiLink],
) -> Result<(), String> {
    if unresolved.is_empty() {
        return Ok(());
    }
    let mut stmt = conn
        .prepare(
            "SELECT id, title FROM documents
             WHERE deleted_at IS NULL
             ORDER BY updated_at DESC
             LIMIT 250",
        )
        .map_err(|e| e.to_string())?;
    let candidates = stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let titles: Vec<String> = candidates.iter().map(|(_, t)| t.clone()).collect();

    for item in unresolved.iter_mut() {
        let exclude = item.label.to_lowercase();
        let mut suggestions = Vec::new();
        for (title, score) in fuzzy_extract(&item.label, &titles, 4, 0.78) {
            if title.to_lowercase() == exclude {
                continue;
            }
            if let Some((id, _)) = candidates.iter().find(|(_, t)| t == &title) {
                suggestions.push(TitleMatch {
                    id: id.clone(),
                    title,
                    score,
                });
            }
            if suggestions.len() >= 3 {
                break;
            }
        }
        item.suggestions = suggestions;
    }
    Ok(())
}

/// Set `targetId` on unresolved wikiLink nodes matching `label` in one document.
pub fn resolve_wiki_link_in_document(
    conn: &Connection,
    document_id: &str,
    label: &str,
    target_id: &str,
) -> Result<ResolveWikiLinkResult, String> {
    let document_id = document_id.trim();
    let label = label.trim();
    let target_id = target_id.trim();
    if document_id.is_empty() || label.is_empty() || target_id.is_empty() {
        return Err("documentId, label, and targetId are required".to_string());
    }

    let target_title: String = conn
        .query_row(
            "SELECT title FROM documents WHERE id = ?1 AND deleted_at IS NULL",
            params![target_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Target document not found: {target_id}"))?;

    let row: Option<(String, String, Option<i64>)> = conn
        .query_row(
            "SELECT title, content_json, deleted_at FROM documents WHERE id = ?1",
            params![document_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((title, content_json, deleted_at)) = row else {
        return Err(format!("Document not found: {document_id}"));
    };
    if deleted_at.is_some() {
        return Err(format!("Document not found: {document_id}"));
    }
    if content_is_vault_cipher(&content_json) {
        return Err("Cannot resolve wiki links in a vault document while locked".to_string());
    }

    let mut value: Value =
        serde_json::from_str(&content_json).map_err(|e| format!("invalid content JSON: {e}"))?;
    let mut updated = 0i64;
    patch_wiki_links(&mut value, label, target_id, &mut updated);
    if updated == 0 {
        return Err(format!("No unresolved [[{label}]] found in document"));
    }

    let new_json = serde_json::to_string(&value).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "UPDATE documents SET content_json = ?1, updated_at = ?2 WHERE id = ?3",
        params![new_json, now, document_id],
    )
    .map_err(|e| e.to_string())?;
    sync_document_fts(conn, document_id, &title, &new_json)?;
    sync_document_links(conn, document_id, &new_json)?;

    Ok(ResolveWikiLinkResult {
        document_id: document_id.to_string(),
        label: label.to_string(),
        target_id: target_id.to_string(),
        target_title,
        updated,
    })
}

fn patch_wiki_links(value: &mut Value, label: &str, target_id: &str, updated: &mut i64) {
    if value.get("type").and_then(Value::as_str) == Some("wikiLink") {
        let node_label = value
            .pointer("/attrs/label")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let existing = value
            .pointer("/attrs/targetId")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty());
        if node_label == label && existing.is_none() {
            if let Some(attrs) = value.get_mut("attrs").and_then(Value::as_object_mut) {
                attrs.insert("targetId".into(), Value::String(target_id.to_string()));
                *updated += 1;
            }
        }
    }
    if let Some(content) = value.get_mut("content").and_then(Value::as_array_mut) {
        for child in content.iter_mut() {
            patch_wiki_links(child, label, target_id, updated);
        }
    }
}
