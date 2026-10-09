//! Offline title suggestion (Rust fallback).

use regex::Regex;
use serde_json::{json, Value};
use std::sync::OnceLock;

use super::types::NlpTitleSuggestion;

fn heading_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?m)^#{1,6}\s+(.+)$").expect("heading"))
}

fn sentence_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[.!?]+\s+").expect("sentence"))
}

fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn slugify(value: &str) -> String {
    let cleaned = value.to_lowercase();
    let mut out = String::new();
    for ch in cleaned.chars() {
        if ch.is_alphanumeric() || ch == '-' {
            out.push(ch);
        } else if ch.is_whitespace() || ch == '_' {
            if !out.ends_with('-') {
                out.push('-');
            }
        }
    }
    out.trim_matches('-').chars().take(80).collect()
}

fn pack(title: &str, max_chars: usize, source: &str) -> NlpTitleSuggestion {
    let mut clipped = normalize(title);
    if clipped.chars().count() > max_chars {
        clipped = clipped.chars().take(max_chars.saturating_sub(1)).collect::<String>() + "…";
    }
    NlpTitleSuggestion {
        slug: slugify(&clipped),
        title: clipped,
        source: source.to_string(),
    }
}

pub fn suggest_title(text: &str, max_chars: usize) -> NlpTitleSuggestion {
    let max_chars = max_chars.clamp(16, 120);
    if let Some(caps) = heading_re().captures(text) {
        let title = normalize(caps.get(1).map(|m| m.as_str()).unwrap_or(""));
        if title.len() >= 3 {
            return pack(&title, max_chars, "heading");
        }
    }
    for sentence in sentence_re().split(text) {
        let cleaned = normalize(sentence.trim());
        if cleaned.starts_with(['-', '*', '+', '[']) || cleaned.len() < 8 {
            continue;
        }
        return pack(&cleaned, max_chars, "lead");
    }
    NlpTitleSuggestion {
        title: String::new(),
        slug: String::new(),
        source: "empty".to_string(),
    }
}

pub fn suggest_title_value(text: &str, max_chars: usize) -> Value {
    serde_json::to_value(suggest_title(text, max_chars)).unwrap_or_else(|_| json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_heading() {
        let report = suggest_title("# Local Agents\n\nBody text about specialists.", 72);
        assert_eq!(report.title, "Local Agents");
        assert_eq!(report.source, "heading");
    }
}
