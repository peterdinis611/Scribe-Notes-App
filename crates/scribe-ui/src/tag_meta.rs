//! Convention tags: status:/project:/year: — mirrors FE + scribe-core.

use serde::{Deserialize, Serialize};

pub const STATUS_TAG_VALUES: &[&str] = &["draft", "review", "done", "archived"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TagKind {
    Status,
    Project,
    Year,
    Plain,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedTag {
    pub raw: String,
    pub kind: TagKind,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct MetaFilters {
    pub status: Option<String>,
    pub project: Option<String>,
    pub year: Option<String>,
}

pub fn parse_tag(raw: &str) -> ParsedTag {
    let trimmed = raw.trim();
    let Some((kind_raw, value_raw)) = trimmed.split_once(':') else {
        return ParsedTag {
            raw: trimmed.into(),
            kind: TagKind::Plain,
            value: trimmed.into(),
        };
    };
    let kind = match kind_raw.to_ascii_lowercase().as_str() {
        "status" => TagKind::Status,
        "project" => TagKind::Project,
        "year" => TagKind::Year,
        _ => {
            return ParsedTag {
                raw: trimmed.into(),
                kind: TagKind::Plain,
                value: trimmed.into(),
            }
        }
    };
    ParsedTag {
        raw: trimmed.into(),
        kind,
        value: value_raw.trim().to_string(),
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
    if let Some(status) = filters.status.as_deref() {
        let needle = make_meta_tag(TagKind::Status, status);
        if !tags.iter().any(|t| t.eq_ignore_ascii_case(&needle)) {
            return false;
        }
    }
    if let Some(project) = filters.project.as_deref() {
        let needle = make_meta_tag(TagKind::Project, project);
        if !tags.iter().any(|t| t.eq_ignore_ascii_case(&needle)) {
            return false;
        }
    }
    if let Some(year) = filters.year.as_deref() {
        let needle = make_meta_tag(TagKind::Year, year);
        if !tags.iter().any(|t| t.eq_ignore_ascii_case(&needle)) {
            return false;
        }
    }
    true
}

pub fn status_tag_values() -> Vec<String> {
    STATUS_TAG_VALUES.iter().map(|s| (*s).to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_filters() {
        assert_eq!(parse_tag("status:draft").kind, TagKind::Status);
        assert!(document_matches_meta_filters(
            &["status:draft".into()],
            &MetaFilters {
                status: Some("draft".into()),
                ..Default::default()
            }
        ));
    }
}
