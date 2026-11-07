//! Shared AI DTOs that hosts fill from DB / sidecar results.

use serde::{Deserialize, Serialize};

/// One ranked chunk from embedding (or other) retrieval — host-owned data, AI-shaped.
#[derive(Debug, Clone)]
pub struct RankedPassageChunk {
    pub snippet: String,
    pub score: f64,
    pub chunk_index: i32,
}

impl RankedPassageChunk {
    pub fn new(snippet: impl Into<String>, score: f64, chunk_index: i32) -> Self {
        Self {
            snippet: snippet.into(),
            score,
            chunk_index,
        }
    }
}

// --- Offline / sidecar-shared report shapes (also used by scribe-core::nlp::parse) ---

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpTitleSuggestion {
    pub title: String,
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpMentionLink {
    pub label: String,
    pub href: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpMentionEdge {
    pub kind: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpMentions {
    #[serde(default)]
    pub wiki_links: Vec<String>,
    #[serde(default)]
    pub mentions: Vec<String>,
    #[serde(default)]
    pub hosts: Vec<String>,
    #[serde(default)]
    pub markdown_links: Vec<NlpMentionLink>,
    #[serde(default)]
    pub edges: Vec<NlpMentionEdge>,
    #[serde(default)]
    pub edge_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpTemplateHints {
    #[serde(default)]
    pub expected: Vec<String>,
    #[serde(default)]
    pub present: Vec<String>,
    #[serde(default)]
    pub missing: Vec<String>,
    #[serde(default)]
    pub coverage: f64,
    #[serde(default)]
    pub complete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpSectionSummary {
    pub title: String,
    #[serde(default)]
    pub level: i64,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub bullets: Vec<String>,
    #[serde(default)]
    pub char_count: i64,
    #[serde(default)]
    pub sentence_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpSectionSummaries {
    #[serde(default)]
    pub sections: Vec<NlpSectionSummary>,
    #[serde(default)]
    pub count: i64,
    #[serde(default)]
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpDecision {
    pub text: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpDecisions {
    #[serde(default)]
    pub decisions: Vec<NlpDecision>,
    #[serde(default)]
    pub count: i64,
    #[serde(default)]
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpQuote {
    pub text: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attribution: Option<String>,
    #[serde(default)]
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpQuotes {
    #[serde(default)]
    pub quotes: Vec<NlpQuote>,
    #[serde(default)]
    pub count: i64,
    #[serde(default)]
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpPiiFinding {
    pub kind: String,
    pub label: String,
    #[serde(rename = "match")]
    pub matched: String,
    #[serde(default)]
    pub start: i64,
    #[serde(default)]
    pub end: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpPiiReport {
    #[serde(default)]
    pub findings: Vec<NlpPiiFinding>,
    #[serde(default)]
    pub count: i64,
    #[serde(default)]
    pub by_kind: std::collections::BTreeMap<String, i64>,
    #[serde(default)]
    pub risk: String,
    #[serde(default)]
    pub safe_to_share: bool,
    #[serde(default)]
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpDuplicatePair {
    pub left_id: String,
    pub left_title: String,
    pub right_id: String,
    pub right_title: String,
    #[serde(default)]
    pub score: f64,
    #[serde(default)]
    pub jaccard: f64,
    #[serde(default)]
    pub embed_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpDuplicates {
    #[serde(default)]
    pub pairs: Vec<NlpDuplicatePair>,
    #[serde(default)]
    pub compared: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpCitation {
    pub document_id: String,
    pub title: String,
    pub snippet: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chunk_index: Option<i32>,
}
