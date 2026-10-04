//! Offline note health pulse (Rust fallback when Python NLP is off).

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpNotePulse {
    #[serde(default)]
    pub score: i64,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub open_task_count: i64,
    #[serde(default)]
    pub date_count: i64,
    #[serde(default)]
    pub word_count: i64,
    #[serde(default)]
    pub pii_risk: String,
    #[serde(default)]
    pub pii_count: i64,
    #[serde(default)]
    pub hints: Vec<String>,
    #[serde(default)]
    pub source: String,
}

fn checkbox_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?m)^\s*[-*]\s*\[\s*\]\s+").expect("checkbox"))
}

fn email_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}").expect("email"))
}

fn date_hint_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)\b(today|tomorrow|deadline|due|termín|zajtra|dnes|\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?)\b")
            .expect("date")
    })
}

pub fn note_pulse(text: &str) -> NlpNotePulse {
    let open_task_count = checkbox_re().find_iter(text).count() as i64;
    let pii_count = email_re().find_iter(text).count() as i64;
    let date_count = date_hint_re().find_iter(text).count() as i64;
    let word_count = text.split_whitespace().count() as i64;

    let mut hints = Vec::new();
    if open_task_count >= 5 {
        hints.push("many_open_tasks".to_string());
    }
    if date_count >= 3 {
        hints.push("dense_dates".to_string());
    }
    if pii_count > 0 {
        hints.push("pii_present".to_string());
    }
    if word_count < 40 {
        hints.push("thin_note".to_string());
    } else if word_count > 2500 {
        hints.push("long_note".to_string());
    }

    let mut score = 70_i64;
    score -= (open_task_count * 2).min(20);
    score -= (pii_count * 3).min(15);
    if word_count < 40 {
        score -= 15;
    }
    if hints.iter().any(|h| h == "long_note") {
        score -= 5;
    }
    score = score.clamp(0, 100);

    let pii_risk = if pii_count >= 3 {
        "high"
    } else if pii_count > 0 {
        "medium"
    } else {
        "low"
    };

    NlpNotePulse {
        score,
        summary: format!(
            "{open_task_count} open tasks; {date_count} date hints; PII risk {pii_risk}; {word_count} words"
        ),
        open_task_count,
        date_count,
        word_count,
        pii_risk: pii_risk.to_string(),
        pii_count,
        hints,
        source: "rust".to_string(),
    }
}

pub fn note_pulse_value(text: &str) -> Value {
    serde_json::to_value(note_pulse(text)).unwrap_or_else(|_| json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scores_thin_note_with_task() {
        let report = note_pulse("- [ ] Ship\nemail a@b.com");
        assert!(report.open_task_count >= 1);
        assert_eq!(report.pii_risk, "medium");
        assert!(report.score < 70);
    }
}
