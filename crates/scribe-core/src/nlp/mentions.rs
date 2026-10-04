//! Offline @mention / wiki-link harvest (Rust fallback).

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::OnceLock;

use super::types::NlpMentionEdge;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpMentionsReport {
    #[serde(default)]
    pub wiki_links: Vec<String>,
    #[serde(default)]
    pub mentions: Vec<String>,
    #[serde(default)]
    pub edges: Vec<NlpMentionEdge>,
    #[serde(default)]
    pub edge_count: i64,
    #[serde(default)]
    pub source: String,
}

fn mention_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)(?:^|[^\w])@([\w\u00C0-\u024F][\w\u00C0-\u024F._-]{1,40})").expect("mention"))
}

fn wiki_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\[\[([^\[\]]{1,80})\]\]").expect("wiki"))
}

fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn extract_mentions(text: &str) -> NlpMentionsReport {
    let mut wiki_links = Vec::new();
    let mut mentions = Vec::new();
    let mut seen_wiki = HashSet::new();
    let mut seen_mentions = HashSet::new();
    let mut edges = Vec::new();

    for caps in wiki_re().captures_iter(text) {
        let target = normalize(caps.get(1).map(|m| m.as_str()).unwrap_or(""));
        let key = target.to_lowercase();
        if target.is_empty() || !seen_wiki.insert(key) {
            continue;
        }
        wiki_links.push(target.clone());
        edges.push(NlpMentionEdge {
            kind: "wiki".to_string(),
            target,
        });
    }

    for caps in mention_re().captures_iter(text) {
        let name = caps
            .get(1)
            .map(|m| m.as_str().trim_end_matches(['.', ',', ';', ':', '!', '?']))
            .unwrap_or("");
        if name.len() < 2 {
            continue;
        }
        let key = name.to_lowercase();
        if !seen_mentions.insert(key) {
            continue;
        }
        mentions.push(name.to_string());
        edges.push(NlpMentionEdge {
            kind: "mention".to_string(),
            target: name.to_string(),
        });
    }

    NlpMentionsReport {
        edge_count: edges.len() as i64,
        wiki_links,
        mentions,
        edges,
        source: "rust".to_string(),
    }
}

pub fn extract_mentions_value(text: &str) -> Value {
    serde_json::to_value(extract_mentions(text)).unwrap_or_else(|_| json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_mentions_and_wiki() {
        let report = extract_mentions("Ping @Alice and see [[Project Atlas]].");
        assert!(report.mentions.iter().any(|m| m == "Alice"));
        assert!(report.wiki_links.iter().any(|m| m == "Project Atlas"));
    }
}
