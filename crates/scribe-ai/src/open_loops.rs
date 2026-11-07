//! Offline open-loop harvest (tasks + commitment-like lines).

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::OnceLock;

use super::commitments::extract_commitments;
use super::task_rank::rank_tasks;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpOpenLoop {
    pub text: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub score: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due_hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpOpenLoops {
    #[serde(default)]
    pub loops: Vec<NlpOpenLoop>,
    #[serde(default)]
    pub count: i64,
    #[serde(default)]
    pub open_task_count: i64,
    #[serde(default)]
    pub commitment_count: i64,
    #[serde(default)]
    pub source: String,
}

fn due_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)\b(today|tomorrow|asap|deadline|due|dnes|zajtra|termín|urgent)\b")
            .expect("due")
    })
}

pub fn open_loops(text: &str, limit: usize) -> NlpOpenLoops {
    let limit = limit.clamp(1, 40);
    let mut loops = Vec::new();
    let mut seen = HashSet::new();

    for task in rank_tasks(text, limit).tasks {
        let key = task.text.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        loops.push(NlpOpenLoop {
            text: task.text,
            kind: "task".to_string(),
            score: task.score + 0.5,
            due_hint: task.due_hint,
        });
    }

    for item in extract_commitments(text, limit).commitments {
        let key = item.text.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        let mut score = 2.2_f64;
        if due_re().is_match(&item.text) {
            score += 1.0;
        }
        loops.push(NlpOpenLoop {
            text: item.text,
            kind: "commitment".to_string(),
            score,
            due_hint: item.due_hint,
        });
    }

    loops.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    loops.truncate(limit);
    let open_task_count = loops.iter().filter(|row| row.kind == "task").count() as i64;
    let commitment_count = loops.iter().filter(|row| row.kind == "commitment").count() as i64;

    NlpOpenLoops {
        count: loops.len() as i64,
        open_task_count,
        commitment_count,
        loops,
        source: "rust".to_string(),
    }
}

pub fn open_loops_value(text: &str, limit: usize) -> Value {
    serde_json::to_value(open_loops(text, limit)).unwrap_or_else(|_| json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_open_task() {
        let report = open_loops("- [ ] Ship ASAP\nI will follow up tomorrow.", 8);
        assert!(report.count >= 1);
        assert!(report.open_task_count >= 1);
    }
}
