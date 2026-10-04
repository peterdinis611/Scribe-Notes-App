//! Offline decision-log extraction (Rust fallback when Python NLP is off).

use regex::Regex;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::OnceLock;

use super::types::{NlpDecision, NlpDecisions};

fn decision_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)\b(decid(?:ed|e|es|ing)|decision|agreed|agreement|approved|resolved|we\s+will|we'll|going\s+with|chose|chosen|final(?:ized)?|rozhod(?:li|núť|nutie|uje)|dohodli|schválili|odsúhlasili|uzavreli)\b",
        )
        .expect("decision")
    })
}

fn labeled_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)^(?:decision|rozhodnutie|agreed|dohoda)\s*[:\-–]\s*(.+)$")
            .expect("labeled")
    })
}

fn owner_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)\b(?:owner|assignee|zodpovedá|vlastník)\s*[:\-–]\s*([^\n,;]+)")
            .expect("owner")
    })
}

fn status_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)\b(pending|open|done|blocked|approved|rejected|otvorené|schválené|zamietnuté|blokované)\b",
        )
        .expect("status")
    })
}

fn sentence_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[.!?]+\s+").expect("sentence"))
}

fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Extract decision-like sentences. Always available offline.
pub fn extract_decisions(text: &str, limit: usize) -> NlpDecisions {
    let limit = limit.clamp(1, 40);
    let mut decisions = Vec::new();
    let mut seen = HashSet::new();

    for sentence in sentence_re().split(text) {
        let cleaned = normalize(sentence.trim());
        if cleaned.len() < 18 || !decision_re().is_match(&cleaned) {
            continue;
        }
        let key = cleaned.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        let owner = owner_re()
            .captures(&cleaned)
            .and_then(|c| c.get(1))
            .map(|m| normalize(m.as_str()));
        let status = status_re()
            .captures(&cleaned)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_lowercase());
        decisions.push(NlpDecision {
            text: cleaned,
            kind: "decision".to_string(),
            owner,
            status,
        });
        if decisions.len() >= limit {
            break;
        }
    }

    for line in text.lines() {
        if decisions.len() >= limit {
            break;
        }
        let Some(caps) = labeled_re().captures(line.trim()) else {
            continue;
        };
        let cleaned = normalize(caps.get(1).map(|m| m.as_str()).unwrap_or(""));
        if cleaned.len() < 8 {
            continue;
        }
        let key = cleaned.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        decisions.push(NlpDecision {
            text: cleaned,
            kind: "labeled".to_string(),
            owner: None,
            status: None,
        });
    }

    NlpDecisions {
        count: decisions.len() as i64,
        decisions,
        source: "rust".to_string(),
    }
}

pub fn extract_decisions_value(text: &str, limit: usize) -> Value {
    serde_json::to_value(extract_decisions(text, limit)).unwrap_or_else(|_| json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_en_and_sk_decisions() {
        let report = extract_decisions(
            "We decided to ship locally. Decision: keep NLP offline. Rozhodnutie: žiadny cloud.",
            8,
        );
        assert!(report.count >= 2);
        assert_eq!(report.source, "rust");
        assert!(report
            .decisions
            .iter()
            .any(|d| d.text.to_lowercase().contains("ship") || d.kind == "labeled"));
    }
}
