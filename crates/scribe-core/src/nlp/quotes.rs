//! Offline quote extraction (Rust fallback when Python NLP is off).

use regex::Regex;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::OnceLock;

use super::types::{NlpQuote, NlpQuotes};

fn quoted_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"[„“"«]([^„“"»]{12,220})[“"»]"#).expect("quoted"))
}

fn signal_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)\b(said|wrote|noted|quoted|according to|povedal|napísal|uviedol|cituje)\b")
            .expect("signal")
    })
}

fn sentence_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[.!?]+\s+").expect("sentence"))
}

fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn extract_quotes(text: &str, limit: usize) -> NlpQuotes {
    let limit = limit.clamp(1, 30);
    let mut quotes = Vec::new();
    let mut seen = HashSet::new();

    for caps in quoted_re().captures_iter(text) {
        let Some(m) = caps.get(1) else { continue };
        let cleaned = normalize(m.as_str().trim());
        if cleaned.len() < 12 {
            continue;
        }
        let key = cleaned.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        quotes.push(NlpQuote {
            text: cleaned,
            kind: "quoted".to_string(),
            attribution: None,
            score: 2.5,
        });
    }

    for sentence in sentence_re().split(text) {
        let cleaned = normalize(sentence.trim());
        if cleaned.len() < 28 || cleaned.len() > 240 {
            continue;
        }
        let mut score = 0.0_f64;
        if signal_re().is_match(&cleaned) {
            score += 1.6;
        }
        let tokens = cleaned.split_whitespace().count();
        if (8..=28).contains(&tokens) {
            score += 0.8;
        }
        if cleaned.ends_with(['.', '!', '?'])
            && cleaned
                .chars()
                .next()
                .map(|c| c.is_uppercase())
                .unwrap_or(false)
        {
            score += 0.4;
        }
        if cleaned.matches(',').count() <= 1 && (40..=140).contains(&cleaned.len()) {
            score += 0.5;
        }
        if score < 1.8 {
            continue;
        }
        let key = cleaned.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        quotes.push(NlpQuote {
            text: cleaned,
            kind: "salient".to_string(),
            attribution: None,
            score,
        });
    }

    quotes.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    quotes.truncate(limit);

    NlpQuotes {
        count: quotes.len() as i64,
        quotes,
        source: "rust".to_string(),
    }
}

pub fn extract_quotes_value(text: &str, limit: usize) -> Value {
    serde_json::to_value(extract_quotes(text, limit)).unwrap_or_else(|_| json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_quoted_line() {
        let report = extract_quotes(
            r#"Alice said "Local-first notes beat the cloud every time.""#,
            5,
        );
        assert!(report.count >= 1);
        assert_eq!(report.source, "rust");
    }
}
