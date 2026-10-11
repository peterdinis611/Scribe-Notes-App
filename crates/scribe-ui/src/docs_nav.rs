//! In-app docs topic ids + groups (FE `DocsView`).

use serde::{Deserialize, Serialize};

pub const DOCS_TOPIC_IDS: &[&str] = &[
    "overview",
    "privacy",
    "documents",
    "library",
    "linkGraph",
    "wikiLinks",
    "editor",
    "search",
    "localAi",
    "revisions",
    "mcp",
    "plugins",
    "journal",
    "backup",
    "shortcuts",
];

pub const DOCS_QUICK_LINKS: &[&str] = &["library", "localAi", "revisions", "plugins"];

/// Optional tip copy keys under `settings.docs.*Tip` + shortcut label (FE `DOCS_TOPIC_TIPS`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocsTopicTip {
    pub topic_id: String,
    pub tip_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shortcut: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocsGroup {
    pub id: String,
    pub topics: Vec<String>,
}

pub fn docs_topic_ids() -> Vec<String> {
    DOCS_TOPIC_IDS.iter().map(|id| (*id).to_string()).collect()
}

pub fn docs_quick_links() -> Vec<String> {
    DOCS_QUICK_LINKS.iter().map(|id| (*id).to_string()).collect()
}

pub fn docs_groups() -> Vec<DocsGroup> {
    vec![
        DocsGroup {
            id: "basics".into(),
            topics: vec!["overview".into(), "privacy".into(), "documents".into()],
        },
        DocsGroup {
            id: "organize".into(),
            topics: vec!["library".into(), "linkGraph".into(), "wikiLinks".into()],
        },
        DocsGroup {
            id: "write".into(),
            topics: vec![
                "editor".into(),
                "search".into(),
                "localAi".into(),
                "revisions".into(),
                "journal".into(),
            ],
        },
        DocsGroup {
            id: "power".into(),
            topics: vec![
                "mcp".into(),
                "plugins".into(),
                "backup".into(),
                "shortcuts".into(),
            ],
        },
    ]
}

pub fn is_docs_topic(value: &str) -> bool {
    DOCS_TOPIC_IDS.contains(&value)
}

pub fn docs_topic_tips() -> Vec<DocsTopicTip> {
    vec![
        tip("search", "searchTip", Some("⌘K")),
        tip("journal", "journalTip", Some("⌘J")),
        tip("shortcuts", "shortcutsTip", Some("⌘,")),
        tip("localAi", "localAiTip", Some("⌘K")),
        tip("revisions", "revisionsTip", None),
        tip("mcp", "mcpTip", None),
        tip("plugins", "pluginsTip", None),
    ]
}

fn tip(topic_id: &str, tip_key: &str, shortcut: Option<&str>) -> DocsTopicTip {
    DocsTopicTip {
        topic_id: topic_id.into(),
        tip_key: tip_key.into(),
        shortcut: shortcut.map(|s| s.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn topics_cover_groups() {
        let ids = docs_topic_ids();
        assert_eq!(ids.len(), 15);
        for group in docs_groups() {
            for topic in group.topics {
                assert!(is_docs_topic(&topic), "missing {topic}");
            }
        }
    }
}
