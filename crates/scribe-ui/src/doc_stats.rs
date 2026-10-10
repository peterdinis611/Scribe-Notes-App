//! TipTap JSON title extraction + word/character counts.

use serde_json::Value;

const DEFAULT_UNTITLED: &str = "Bez názvu";

fn collect_texts(node: &Value, out: &mut Vec<String>) {
    if let Some(text) = node.get("text").and_then(|t| t.as_str()) {
        out.push(text.to_string());
    }
    if let Some(children) = node.get("content").and_then(|c| c.as_array()) {
        for child in children {
            collect_texts(child, out);
        }
    }
}

pub fn extract_title_from_content(content_json: &str) -> String {
    extract_title_from_content_with_fallback(content_json, DEFAULT_UNTITLED)
}

pub fn extract_title_from_content_with_fallback(content_json: &str, fallback: &str) -> String {
    let Ok(doc) = serde_json::from_str::<Value>(content_json) else {
        return fallback.into();
    };
    let Some(nodes) = doc.get("content").and_then(|c| c.as_array()) else {
        return fallback.into();
    };

    for node in nodes {
        if node.get("type").and_then(|t| t.as_str()) == Some("heading") {
            let mut texts = Vec::new();
            collect_texts(node, &mut texts);
            let title = texts.join("").trim().to_string();
            if !title.is_empty() {
                return title.chars().take(120).collect();
            }
        }
    }

    for node in nodes {
        if node.get("type").and_then(|t| t.as_str()) == Some("paragraph") {
            let mut texts = Vec::new();
            collect_texts(node, &mut texts);
            let title = texts.join("").trim().to_string();
            if !title.is_empty() {
                return title.chars().take(120).collect();
            }
        }
    }

    fallback.into()
}

fn count_text_units(content_json: &str, characters: bool) -> usize {
    let Ok(doc) = serde_json::from_str::<Value>(content_json) else {
        return 0;
    };
    let mut texts = Vec::new();
    collect_texts(&doc, &mut texts);
    let text = texts.join(" ");
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return 0;
    }
    if characters {
        trimmed.chars().filter(|c| !c.is_whitespace()).count()
    } else {
        trimmed.split_whitespace().filter(|s| !s.is_empty()).count()
    }
}

pub fn count_words(content_json: &str) -> usize {
    count_text_units(content_json, false)
}

pub fn count_characters(content_json: &str) -> usize {
    count_text_units(content_json, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_and_counts() {
        let json = r#"{"type":"doc","content":[
          {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Hello"}]},
          {"type":"paragraph","content":[{"type":"text","text":"two words"}]}
        ]}"#;
        assert_eq!(extract_title_from_content(json), "Hello");
        assert_eq!(count_words(json), 3);
        assert!(count_characters(json) > 0);
    }
}
