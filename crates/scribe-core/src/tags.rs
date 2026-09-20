//! Document tag helpers (JSON array stored on `documents.tags`).

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdTags {
    pub id: String,
    pub tags: Vec<String>,
}

pub fn parse_tags(raw: Option<String>) -> Vec<String> {
    if let Some(raw) = raw {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Vec::new();
        }
        if trimmed.starts_with('[') {
            if let Ok(Value::Array(items)) = serde_json::from_str::<Value>(trimmed) {
                return items
                    .into_iter()
                    .filter_map(|item| item.as_str().map(str::to_string))
                    .collect();
            }
        }
        return trimmed
            .split(',')
            .map(str::trim)
            .filter(|tag| !tag.is_empty())
            .map(str::to_string)
            .collect();
    }
    Vec::new()
}

pub fn normalize_tags(tags: &[String]) -> Vec<String> {
    let mut cleaned: Vec<String> = tags
        .iter()
        .map(|tag| tag.trim().to_string())
        .filter(|tag| !tag.is_empty())
        .collect();
    cleaned.sort();
    cleaned.dedup();
    cleaned
}

pub fn encode_tags(tags: &[String]) -> String {
    serde_json::to_string(&normalize_tags(tags)).unwrap_or_else(|_| "[]".to_string())
}

/// Replace the full tag list for a document.
pub fn set_document_tags(conn: &Connection, id: &str, tags: &[String]) -> Result<IdTags, String> {
    let row: Option<Option<i64>> = conn
        .query_row(
            "SELECT deleted_at FROM documents WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let Some(deleted_at) = row else {
        return Err(format!("Document not found: {id}"));
    };
    if deleted_at.is_some() {
        return Err(format!("Document not found: {id}"));
    }

    let normalized = normalize_tags(tags);
    conn.execute(
        "UPDATE documents SET tags = ?1 WHERE id = ?2",
        params![encode_tags(&normalized), id],
    )
    .map_err(|e| e.to_string())?;

    Ok(IdTags {
        id: id.to_string(),
        tags: normalized,
    })
}

/// Append one tag to a document (no-op if the tag is already present).
pub fn add_document_tag(conn: &Connection, id: &str, tag: &str) -> Result<IdTags, String> {
    let tag = tag.trim();
    if tag.is_empty() {
        return Err("tag is required".to_string());
    }

    let row: Option<(Option<String>, Option<i64>)> = conn
        .query_row(
            "SELECT tags, deleted_at FROM documents WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let Some((tags_raw, deleted_at)) = row else {
        return Err(format!("Document not found: {id}"));
    };
    if deleted_at.is_some() {
        return Err(format!("Document not found: {id}"));
    }

    let mut tags = parse_tags(tags_raw);
    if !tags.iter().any(|existing| existing == tag) {
        tags.push(tag.to_string());
        tags = normalize_tags(&tags);
        conn.execute(
            "UPDATE documents SET tags = ?1 WHERE id = ?2",
            params![encode_tags(&tags), id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(IdTags {
        id: id.to_string(),
        tags,
    })
}

/// Remove one tag from a document.
pub fn remove_document_tag(conn: &Connection, id: &str, tag: &str) -> Result<IdTags, String> {
    let tag = tag.trim();
    if tag.is_empty() {
        return Err("tag is required".to_string());
    }

    let row: Option<(Option<String>, Option<i64>)> = conn
        .query_row(
            "SELECT tags, deleted_at FROM documents WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let Some((tags_raw, deleted_at)) = row else {
        return Err(format!("Document not found: {id}"));
    };
    if deleted_at.is_some() {
        return Err(format!("Document not found: {id}"));
    }

    let mut tags = parse_tags(tags_raw);
    let before = tags.len();
    tags.retain(|existing| existing != tag);
    if tags.len() != before {
        tags = normalize_tags(&tags);
        conn.execute(
            "UPDATE documents SET tags = ?1 WHERE id = ?2",
            params![encode_tags(&tags), id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(IdTags {
        id: id.to_string(),
        tags,
    })
}
