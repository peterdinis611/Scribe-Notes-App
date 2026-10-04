//! Offline per-section summaries (Rust fallback when Python NLP is off).

use regex::Regex;
use serde_json::{json, Value};
use std::sync::OnceLock;

use super::types::{NlpSectionSummaries, NlpSectionSummary};

fn heading_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^(#{1,6})\s+(.+)$").expect("heading"))
}

fn sentence_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[.!?]+\s+").expect("sentence"))
}

fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn first_sentences(body: &str, max: usize) -> (String, Vec<String>) {
    let mut bullets = Vec::new();
    for part in sentence_re().split(body) {
        let cleaned = normalize(part.trim());
        if cleaned.len() < 20 {
            continue;
        }
        bullets.push(cleaned);
        if bullets.len() >= max {
            break;
        }
    }
    let summary = bullets.join(" ");
    (summary, bullets)
}

pub fn section_summaries(text: &str, limit: usize, max_sentences: usize) -> NlpSectionSummaries {
    let limit = limit.clamp(1, 40);
    let max_sentences = max_sentences.clamp(1, 4);
    let mut sections: Vec<(String, i64, String)> = Vec::new();
    let mut title = "Introduction".to_string();
    let mut level = 1_i64;
    let mut body_lines: Vec<&str> = Vec::new();

    let flush = |sections: &mut Vec<(String, i64, String)>,
                 title: &str,
                 level: i64,
                 body_lines: &mut Vec<&str>| {
        let body = body_lines.join("\n").trim().to_string();
        if !body.is_empty() || title != "Introduction" {
            sections.push((title.to_string(), level, body));
        }
        body_lines.clear();
    };

    for line in text.lines() {
        if let Some(caps) = heading_re().captures(line) {
            flush(&mut sections, &title, level, &mut body_lines);
            level = caps.get(1).map(|m| m.as_str().len() as i64).unwrap_or(1);
            title = normalize(caps.get(2).map(|m| m.as_str()).unwrap_or("Section"));
            if title.is_empty() {
                title = "Section".to_string();
            }
            continue;
        }
        body_lines.push(line);
    }
    flush(&mut sections, &title, level, &mut body_lines);

    let mut items = Vec::new();
    for (sec_title, sec_level, body) in sections.into_iter().take(limit) {
        if body.is_empty() && sec_title == "Introduction" {
            continue;
        }
        let (summary, bullets) = if body.trim().len() < 40 {
            (normalize(&body).chars().take(220).collect(), Vec::new())
        } else {
            first_sentences(&body, max_sentences)
        };
        let sentence_count = sentence_re()
            .split(&body)
            .filter(|s| s.trim().len() >= 20)
            .count() as i64;
        items.push(NlpSectionSummary {
            title: sec_title,
            level: sec_level,
            summary,
            bullets,
            char_count: body.len() as i64,
            sentence_count,
        });
    }

    NlpSectionSummaries {
        count: items.len() as i64,
        sections: items,
        source: "rust".to_string(),
    }
}

pub fn section_summaries_value(text: &str, limit: usize, max_sentences: usize) -> Value {
    serde_json::to_value(section_summaries(text, limit, max_sentences))
        .unwrap_or_else(|_| json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_markdown_headings() {
        let report = section_summaries(
            "# Search\n\nLocal embeddings power search for writers on this Mac.\nMore detail about the index.\n\n# Export\n\nExport notes as Markdown or PDF from the menu.\nTemplates stay local too.\n",
            4,
            2,
        );
        assert!(report.count >= 2);
        assert!(report.sections.iter().any(|s| s.title == "Search"));
    }
}
