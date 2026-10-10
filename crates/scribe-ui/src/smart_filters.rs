//! Library smart-filter ids + match predicate (FE `smart-filters.ts`).

use serde::{Deserialize, Serialize};
use strum::{EnumIter, IntoEnumIterator};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, EnumIter)]
#[serde(rename_all = "camelCase")]
pub enum LibrarySmartFilter {
    None,
    Unlinked,
    Untagged,
    Unread,
}

impl LibrarySmartFilter {
    pub fn as_id(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Unlinked => "unlinked",
            Self::Untagged => "untagged",
            Self::Unread => "unread",
        }
    }

    pub fn parse_id(value: &str) -> Option<Self> {
        match value {
            "none" => Some(Self::None),
            "unlinked" => Some(Self::Unlinked),
            "untagged" => Some(Self::Untagged),
            "unread" => Some(Self::Unread),
            _ => None,
        }
    }
}

pub fn smart_filter_ids() -> Vec<String> {
    LibrarySmartFilter::iter()
        .map(|f| f.as_id().to_string())
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SmartFilterDoc {
    pub id: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SmartFilterOptions {
    #[serde(default)]
    pub orphan_ids: Vec<String>,
    #[serde(default)]
    pub recent_document_ids: Vec<String>,
}

pub fn document_matches_smart_filter(
    doc: &SmartFilterDoc,
    filter: LibrarySmartFilter,
    options: &SmartFilterOptions,
) -> bool {
    if filter == LibrarySmartFilter::None {
        return true;
    }
    if doc.deleted_at.is_some() {
        return false;
    }
    match filter {
        LibrarySmartFilter::None => true,
        LibrarySmartFilter::Untagged => doc.tags.is_empty(),
        LibrarySmartFilter::Unlinked => options.orphan_ids.iter().any(|id| id == &doc.id),
        LibrarySmartFilter::Unread => !options.recent_document_ids.iter().any(|id| id == &doc.id),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn untagged_and_unread() {
        let doc = SmartFilterDoc {
            id: "a".into(),
            tags: vec![],
            deleted_at: None,
        };
        assert!(document_matches_smart_filter(
            &doc,
            LibrarySmartFilter::Untagged,
            &SmartFilterOptions::default()
        ));
        assert!(document_matches_smart_filter(
            &doc,
            LibrarySmartFilter::Unread,
            &SmartFilterOptions {
                recent_document_ids: vec!["b".into()],
                ..Default::default()
            }
        ));
        assert!(!document_matches_smart_filter(
            &doc,
            LibrarySmartFilter::Unread,
            &SmartFilterOptions {
                recent_document_ids: vec!["a".into()],
                ..Default::default()
            }
        ));
    }
}
