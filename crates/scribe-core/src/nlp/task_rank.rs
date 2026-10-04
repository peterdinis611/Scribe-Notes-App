//! Offline open-task ranking (Rust fallback when Python NLP is off).

use regex::Regex;
use serde_json::{json, Value};
use std::sync::OnceLock;

use super::types::{NlpRankedTask, NlpRankedTasks};

fn checkbox_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?m)^\s*[-*]\s*\[\s*\]\s+(.+)$").expect("checkbox"))
}

fn todo_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)^\s*(?:TODO|FIXME|ACTION|ÚLOHA|ULOHA)\s*[:\-–]\s*(.+)$").expect("todo")
    })
}

fn urgent_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)\b(urgent|asap|critical|blocker|p0|p1|high priority|urgentné|kritické|ihneď|hned|dnes|today|tomorrow|zajtra)\b",
        )
        .expect("urgent")
    })
}

fn low_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"(?i)\b(someday|later|nice to have|low priority|optional|niekedy|neskôr|voliteľné)\b",
        )
        .expect("low")
    })
}

fn due_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)\b(?:due|by|termín|do)\s+([A-Za-zÁ-Žá-ž0-9 ./-]{3,32})")
            .expect("due")
    })
}

fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn score_task(cleaned: &str, kind: &str) -> NlpRankedTask {
    let mut score = 1.0_f64;
    let mut reasons = Vec::new();
    let due = due_re()
        .captures(cleaned)
        .and_then(|c| c.get(1))
        .map(|m| normalize(m.as_str()));
    if due.is_some() {
        score += 2.0;
        reasons.push("has_due".to_string());
    }
    if urgent_re().is_match(cleaned) {
        score += 2.5;
        reasons.push("urgent_language".to_string());
    }
    if low_re().is_match(cleaned) {
        score -= 1.2;
        reasons.push("low_priority_language".to_string());
    }
    if kind == "checkbox" {
        score += 0.3;
    }
    NlpRankedTask {
        text: cleaned.to_string(),
        due_hint: due,
        kind: Some(kind.to_string()),
        score: (score * 1000.0).round() / 1000.0,
        reasons,
    }
}

pub fn rank_tasks(text: &str, limit: usize) -> NlpRankedTasks {
    let limit = limit.clamp(1, 50);
    let mut ranked = Vec::new();

    for caps in checkbox_re().captures_iter(text) {
        let Some(m) = caps.get(1) else { continue };
        let cleaned = normalize(m.as_str().trim());
        if cleaned.len() < 3 {
            continue;
        }
        ranked.push(score_task(&cleaned, "checkbox"));
    }
    for caps in todo_re().captures_iter(text) {
        let Some(m) = caps.get(1) else { continue };
        let cleaned = normalize(m.as_str().trim());
        if cleaned.len() < 3 {
            continue;
        }
        ranked.push(score_task(&cleaned, "todo"));
    }

    ranked.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    ranked.truncate(limit);

    NlpRankedTasks {
        count: ranked.len() as i64,
        tasks: ranked,
        source: "rust".to_string(),
    }
}

pub fn rank_tasks_value(text: &str, limit: usize) -> Value {
    serde_json::to_value(rank_tasks(text, limit)).unwrap_or_else(|_| json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranks_open_checkboxes() {
        let report = rank_tasks(
            "- [ ] Ship ASAP\n- [ ] Nice to have later\n- [x] Done already\nTODO: review by Monday",
            10,
        );
        assert!(report.count >= 2);
        assert!(report.tasks[0].score >= report.tasks.last().unwrap().score);
    }
}
