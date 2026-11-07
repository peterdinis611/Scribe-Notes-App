//! Offline forward-plan extraction (Rust fallback when Python NLP is off).

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::OnceLock;

use super::commitments::extract_commitments;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpForwardItem {
    pub text: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due_hint: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpForwardCounts {
    #[serde(default)]
    pub next_steps: i64,
    #[serde(default)]
    pub agenda: i64,
    #[serde(default)]
    pub upcoming: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpForwardPlan {
    #[serde(default)]
    pub next_steps: Vec<NlpForwardItem>,
    #[serde(default)]
    pub agenda: Vec<NlpForwardItem>,
    #[serde(default)]
    pub upcoming: Vec<NlpForwardItem>,
    #[serde(default)]
    pub counts: NlpForwardCounts,
    #[serde(default)]
    pub source: String,
}

fn next_step_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)\b(next\s+steps?|then\s+we|upcoming|what'?s\s+next|follow[- ]?up|going\s+forward|nasleduj|ďalej|dalej|ďalš|dalsie\s+kroky|čo\s+ďalej|co\s+dalej|budúc)\b",
        )
        .expect("next_step")
    })
}

fn upcoming_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)\b(by\s+(?:monday|tuesday|wednesday|thursday|friday|next\s+week)|due\s+|deadline|termín|termin|next\s+week|budúci\s+týždeň|buduci\s+tyzden)\b",
        )
        .expect("upcoming")
    })
}

fn agenda_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)(?:^|\n)\s*(?:agenda|next\s+meeting|nasledujúce\s+stretnutie|nasledujuce\s+stretnutie)\s*[:\-–]\s*(.+)",
        )
        .expect("agenda")
    })
}

fn sentence_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[.!?]+\s+").expect("sentence"))
}

fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn push_item(
    items: &mut Vec<NlpForwardItem>,
    seen: &mut HashSet<String>,
    raw: &str,
    kind: &str,
    due_hint: Option<String>,
    limit: usize,
) {
    if items.len() >= limit {
        return;
    }
    let cleaned = normalize(raw.trim());
    if cleaned.len() < 8 {
        return;
    }
    let key = cleaned.to_lowercase();
    if !seen.insert(key) {
        return;
    }
    items.push(NlpForwardItem {
        text: cleaned,
        kind: kind.to_string(),
        due_hint,
    });
}

pub fn forward_plan(text: &str, limit: usize) -> NlpForwardPlan {
    let limit = limit.clamp(1, 40);
    let mut next_steps = Vec::new();
    let mut agenda = Vec::new();
    let mut upcoming = Vec::new();
    let mut seen = HashSet::new();

    for caps in agenda_re().captures_iter(text) {
        if let Some(m) = caps.get(1) {
            for line in m.as_str().lines() {
                let stripped = line.trim().trim_start_matches(['-', '*', '•']);
                let stripped = stripped
                    .trim_start_matches(|c: char| c.is_ascii_digit() || c == '.' || c == ')');
                push_item(
                    &mut agenda,
                    &mut seen,
                    stripped.trim(),
                    "agenda",
                    None,
                    limit,
                );
            }
        }
    }

    for sentence in sentence_re().split(text) {
        let cleaned = normalize(sentence.trim());
        if cleaned.len() < 12 {
            continue;
        }
        if next_step_re().is_match(&cleaned) {
            push_item(
                &mut next_steps,
                &mut seen,
                &cleaned,
                "next_step",
                None,
                limit,
            );
        } else if upcoming_re().is_match(&cleaned) {
            push_item(&mut upcoming, &mut seen, &cleaned, "upcoming", None, limit);
        }
    }

    for item in extract_commitments(text, limit).commitments {
        if let Some(due) = item.due_hint.clone() {
            push_item(
                &mut upcoming,
                &mut seen,
                &item.text,
                "commitment_due",
                Some(due),
                limit,
            );
        } else {
            push_item(
                &mut next_steps,
                &mut seen,
                &item.text,
                "commitment",
                None,
                limit,
            );
        }
    }

    next_steps.truncate(limit);
    agenda.truncate(limit);
    upcoming.truncate(limit);

    NlpForwardPlan {
        counts: NlpForwardCounts {
            next_steps: next_steps.len() as i64,
            agenda: agenda.len() as i64,
            upcoming: upcoming.len() as i64,
        },
        next_steps,
        agenda,
        upcoming,
        source: "rust".to_string(),
    }
}

pub fn forward_plan_value(text: &str, limit: usize) -> Value {
    serde_json::to_value(forward_plan(text, limit)).unwrap_or_else(|_| json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_next_steps() {
        let report = forward_plan(
            "Next steps: ship the agent planner. We will follow up by Friday.",
            8,
        );
        assert!(report.counts.next_steps + report.counts.upcoming >= 1);
    }
}
