//! Offline template section coverage (Rust fallback).

use regex::Regex;
use serde_json::{json, Value};
use std::sync::OnceLock;

use super::types::NlpTemplateHints;

fn heading_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?m)^#{1,6}\s+(.+)$").expect("heading"))
}

fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

const DEFAULT_SECTIONS: &[&str] = &[
    "Cieľ",
    "Goal",
    "Kontext",
    "Context",
    "Next steps",
    "Ďalšie kroky",
    "Zhrnutie",
    "Summary",
];

pub fn template_fill_hints(text: &str, expected_sections: Option<&[String]>) -> NlpTemplateHints {
    let expected: Vec<String> = expected_sections
        .map(|items| {
            items
                .iter()
                .map(|s| normalize(s))
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_else(|| DEFAULT_SECTIONS.iter().map(|s| (*s).to_string()).collect());

    let mut ordered = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for item in expected {
        let key = item.to_lowercase();
        if seen.insert(key) {
            ordered.push(item);
        }
    }

    let titles: Vec<String> = heading_re()
        .captures_iter(text)
        .filter_map(|caps| caps.get(1).map(|m| normalize(m.as_str())))
        .collect();
    let lower_source = text.to_lowercase();

    let mut present = Vec::new();
    let mut missing = Vec::new();
    for section in &ordered {
        let needle = section.to_lowercase();
        let found = titles.iter().any(|title| {
            let hay = title.to_lowercase();
            hay == needle || hay.contains(&needle) || needle.contains(&hay)
        }) || lower_source.contains(&needle);
        if found {
            present.push(section.clone());
        } else {
            missing.push(section.clone());
        }
    }

    let coverage = if ordered.is_empty() {
        1.0
    } else {
        present.len() as f64 / ordered.len() as f64
    };

    NlpTemplateHints {
        complete: missing.is_empty(),
        coverage: (coverage * 1000.0).round() / 1000.0,
        expected: ordered,
        present,
        missing,
    }
}

pub fn template_fill_hints_value(text: &str, expected_sections: Option<&[String]>) -> Value {
    let mut value = serde_json::to_value(template_fill_hints(text, expected_sections))
        .unwrap_or_else(|_| json!({}));
    if let Some(obj) = value.as_object_mut() {
        obj.insert("source".into(), json!("rust"));
    }
    value
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_missing_sections() {
        let report = template_fill_hints("# Goal\n\nShip agents.\n", None);
        assert!(report.present.iter().any(|s| s == "Goal"));
        assert!(!report.complete);
    }
}
