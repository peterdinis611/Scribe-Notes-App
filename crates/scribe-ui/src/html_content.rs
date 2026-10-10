//! Import helpers: plain text / normalize TipTap doc JSON (HTML→JSON stays FE/TipTap).

use serde_json::{json, Value};

pub fn empty_doc_json() -> String {
    json!({ "type": "doc", "content": [{ "type": "paragraph" }] }).to_string()
}

fn strip_html_tags(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut in_tag = false;
    for c in value.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn title_from_html(html: &str, fallback: &str) -> String {
    let lower = html.to_ascii_lowercase();
    if let Some(start) = lower.find("<h1") {
        let after = &html[start..];
        if let Some(gt) = after.find('>') {
            let rest = &after[gt + 1..];
            let rest_lower = rest.to_ascii_lowercase();
            if let Some(end) = rest_lower.find("</h1>") {
                let title = strip_html_tags(&rest[..end]);
                if !title.is_empty() {
                    return title;
                }
            }
        }
    }
    fallback.into()
}

pub fn normalize_doc_json(json: &Value) -> String {
    let Some(obj) = json.as_object() else {
        return empty_doc_json();
    };
    if obj.get("type").and_then(|t| t.as_str()) != Some("doc") {
        return empty_doc_json();
    }
    let Some(content) = obj.get("content").and_then(|c| c.as_array()) else {
        return empty_doc_json();
    };
    if content.is_empty() {
        return empty_doc_json();
    }
    json.to_string()
}

/// Split on `\n{2,}` like the FE `plainTextToContentJson`.
pub fn plain_text_to_content_json(text: &str) -> String {
    let mut paragraphs = Vec::new();
    let mut start = 0usize;
    let bytes = text.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'\n' {
            let mut j = i;
            while j < bytes.len() && bytes[j] == b'\n' {
                j += 1;
            }
            if j - i >= 2 {
                let chunk = text[start..i].trim();
                if !chunk.is_empty() {
                    paragraphs.push(chunk.to_string());
                }
                start = j;
                i = j;
                continue;
            }
        }
        i += 1;
    }
    let chunk = text[start..].trim();
    if !chunk.is_empty() {
        paragraphs.push(chunk.to_string());
    }

    if paragraphs.is_empty() {
        return empty_doc_json();
    }

    let content: Vec<Value> = paragraphs
        .into_iter()
        .map(|paragraph| {
            json!({
                "type": "paragraph",
                "content": [{ "type": "text", "text": paragraph }]
            })
        })
        .collect();

    json!({ "type": "doc", "content": content }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_and_title() {
        let doc = plain_text_to_content_json("Hello\n\nWorld");
        assert!(doc.contains("Hello"));
        assert!(doc.contains("World"));
        assert_eq!(
            title_from_html("<h1>Hi <b>there</b></h1><p>x</p>", "fb"),
            "Hi there"
        );
        assert_eq!(
            normalize_doc_json(&json!({"type":"paragraph"})),
            empty_doc_json()
        );
    }
}
