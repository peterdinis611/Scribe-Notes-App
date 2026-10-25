//! PDF → TipTap note (lossy text extract).

use serde_json::{json, Value};

const EMPTY_DOC_JSON: &str = r#"{"type":"doc","content":[{"type":"paragraph"}]}"#;
const MAX_CHARS: usize = 400_000;

pub fn pdf_bytes_to_tiptap(bytes: &[u8]) -> Result<String, String> {
    let text = pdf_extract::extract_text_from_mem(bytes)
        .map_err(|e| format!("Nepodarilo sa načítať PDF: {e}"))?;
    Ok(pdf_text_to_tiptap(&text))
}

pub fn pdf_text_to_tiptap(text: &str) -> String {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let truncated = if normalized.chars().count() > MAX_CHARS {
        normalized.chars().take(MAX_CHARS).collect::<String>() + "\n…"
    } else {
        normalized
    };

    let mut nodes: Vec<Value> = Vec::new();
    for page in truncated.split("\x0C") {
        let page = page.trim();
        if page.is_empty() {
            continue;
        }
        for block in page.split("\n\n") {
            let block = block
                .lines()
                .map(str::trim)
                .filter(|l| !l.is_empty())
                .collect::<Vec<_>>()
                .join(" ");
            if block.is_empty() {
                continue;
            }
            nodes.push(json!({
                "type": "paragraph",
                "content": [{ "type": "text", "text": block }]
            }));
        }
    }

    if nodes.is_empty() {
        // Fallback: line-based paragraphs
        for line in truncated.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            nodes.push(json!({
                "type": "paragraph",
                "content": [{ "type": "text", "text": line }]
            }));
        }
    }

    if nodes.is_empty() {
        return EMPTY_DOC_JSON.to_string();
    }
    serde_json::to_string(&json!({ "type": "doc", "content": nodes }))
        .unwrap_or_else(|_| EMPTY_DOC_JSON.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_yields_empty_doc() {
        assert_eq!(pdf_text_to_tiptap(""), EMPTY_DOC_JSON);
    }

    #[test]
    fn paragraphs_from_blank_lines() {
        let json = pdf_text_to_tiptap("Hello world.\n\nSecond block.");
        assert!(json.contains("Hello world."));
        assert!(json.contains("Second block."));
    }
}
