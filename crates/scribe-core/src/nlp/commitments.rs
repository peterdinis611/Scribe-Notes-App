//! Offline commitment extraction (Rust fallback when Python NLP is off).

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpCommitment {
    pub text: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpCommitments {
    #[serde(default)]
    pub commitments: Vec<NlpCommitment>,
    #[serde(default)]
    pub count: i64,
    #[serde(default)]
    pub source: String,
}

fn commit_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)\b(i\s+will|i'll|we\s+will|we'll|we\s+commit|committed\s+to|promise\s+to|follow\s+up|zaviaž(?:em|e)|zaväzuj(?:em|e)|sľubuj(?:em|e)|budem|budeme|dopracujem|doručím)\b",
        )
        .expect("commit")
    })
}

fn labeled_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)\b(?:commitment|commit|follow[- ]?up|záväzok|slub|sľub)\s*[:\-–]\s*([^.\n]{8,180})",
        )
        .expect("labeled")
    })
}

fn sentence_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[.!?]+\s+").expect("sentence"))
}

fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn extract_commitments(text: &str, limit: usize) -> NlpCommitments {
    let limit = limit.clamp(1, 40);
    let mut items = Vec::new();
    let mut seen = HashSet::new();

    for sentence in sentence_re().split(text) {
        let cleaned = normalize(sentence.trim());
        if cleaned.len() < 16 || !commit_re().is_match(&cleaned) {
            continue;
        }
        let key = cleaned.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        items.push(NlpCommitment {
            text: cleaned,
            kind: "commitment".to_string(),
            owner: None,
            due_hint: None,
        });
        if items.len() >= limit {
            break;
        }
    }

    for caps in labeled_re().captures_iter(text) {
        if items.len() >= limit {
            break;
        }
        let Some(m) = caps.get(1) else { continue };
        let cleaned = normalize(m.as_str().trim());
        if cleaned.len() < 12 {
            continue;
        }
        let key = cleaned.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        items.push(NlpCommitment {
            text: cleaned,
            kind: "labeled".to_string(),
            owner: None,
            due_hint: None,
        });
    }

    NlpCommitments {
        count: items.len() as i64,
        commitments: items,
        source: "rust".to_string(),
    }
}

pub fn extract_commitments_value(text: &str, limit: usize) -> Value {
    serde_json::to_value(extract_commitments(text, limit)).unwrap_or_else(|_| json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_commitments() {
        let report = extract_commitments(
            "I will finish tonight. Commitment: review PRs by Monday.",
            8,
        );
        assert!(report.count >= 2);
    }
}
