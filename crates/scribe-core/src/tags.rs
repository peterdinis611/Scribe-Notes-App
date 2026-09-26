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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TagKind {
    Status,
    Project,
    Year,
    Plain,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedTag {
    pub raw: String,
    pub kind: TagKind,
    pub value: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaFilters {
    pub status: Option<String>,
    pub project: Option<String>,
    pub year: Option<String>,
}

pub const STATUS_TAG_VALUES: &[&str] = &["draft", "review", "done", "archived"];

/// Convention-based structured tags: `status:draft`, `project:Acme`, `year:2026`.
pub fn parse_meta_tag(raw: &str) -> ParsedTag {
    let trimmed = raw.trim();
    if let Some((kind_raw, value_raw)) = trimmed.split_once(':') {
        let kind_l = kind_raw.trim().to_ascii_lowercase();
        let value = value_raw.trim().to_string();
        if !value.is_empty() {
            let kind = match kind_l.as_str() {
                "status" => Some(TagKind::Status),
                "project" => Some(TagKind::Project),
                "year" => Some(TagKind::Year),
                _ => None,
            };
            if let Some(kind) = kind {
                return ParsedTag {
                    raw: trimmed.to_string(),
                    kind,
                    value,
                };
            }
        }
    }
    ParsedTag {
        raw: trimmed.to_string(),
        kind: TagKind::Plain,
        value: trimmed.to_string(),
    }
}

pub fn make_meta_tag(kind: TagKind, value: &str) -> String {
    let prefix = match kind {
        TagKind::Status => "status",
        TagKind::Project => "project",
        TagKind::Year => "year",
        TagKind::Plain => return value.trim().to_string(),
    };
    format!("{prefix}:{}", value.trim())
}

pub fn document_matches_meta_filters(tags: &[String], filters: &MetaFilters) -> bool {
    if let Some(status) = filters.status.as_deref().filter(|s| !s.is_empty()) {
        let needle = make_meta_tag(TagKind::Status, status);
        if !tags
            .iter()
            .any(|tag| tag.eq_ignore_ascii_case(&needle))
        {
            return false;
        }
    }
    if let Some(project) = filters.project.as_deref().filter(|s| !s.is_empty()) {
        let needle = make_meta_tag(TagKind::Project, project);
        if !tags
            .iter()
            .any(|tag| tag.eq_ignore_ascii_case(&needle))
        {
            return false;
        }
    }
    if let Some(year) = filters.year.as_deref().filter(|s| !s.is_empty()) {
        let needle = make_meta_tag(TagKind::Year, year);
        if !tags
            .iter()
            .any(|tag| tag.eq_ignore_ascii_case(&needle))
        {
            return false;
        }
    }
    true
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

#[cfg(test)]
mod meta_tests {
    use super::*;

    #[test]
    fn parses_structured_tags() {
        let parsed = parse_meta_tag("status:draft");
        assert_eq!(parsed.kind, TagKind::Status);
        assert_eq!(parsed.value, "draft");
        assert_eq!(parse_meta_tag("plain").kind, TagKind::Plain);
    }

    #[test]
    fn filters_by_status() {
        let tags = vec!["status:done".to_string(), "project:Acme".to_string()];
        assert!(document_matches_meta_filters(
            &tags,
            &MetaFilters {
                status: Some("done".into()),
                ..Default::default()
            }
        ));
        assert!(!document_matches_meta_filters(
            &tags,
            &MetaFilters {
                status: Some("draft".into()),
                ..Default::default()
            }
        ));
    }
}
