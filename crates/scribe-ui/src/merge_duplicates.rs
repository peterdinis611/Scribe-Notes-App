//! Merge a duplicate note into another (`src/lib/library/merge-duplicates.ts`).
//!
//! Pure TipTap-JSON part only; the DB call (`mergeDocuments`) stays on the caller side.

use serde::Serialize;
use serde_json::{json, Value};

const UNTITLED: &str = "Untitled";

#[derive(Serialize)]
struct MergedDoc<'a> {
    #[serde(rename = "type")]
    doc_type: &'a str,
    content: Vec<Value>,
}

/// Block content of a stored doc; invalid JSON or non-object roots yield no blocks.
fn parse_doc_content(content_json: &str) -> Vec<Value> {
    serde_json::from_str::<Value>(content_json)
        .ok()
        .and_then(|v| v.get("content").and_then(Value::as_array).cloned())
        .unwrap_or_default()
}

fn drop_heading(drop_title: &str) -> Value {
    let trimmed = drop_title.trim();
    json!({
        "type": "heading",
        "attrs": { "level": 2 },
        "content": [{ "type": "text", "text": if trimmed.is_empty() { UNTITLED } else { trimmed } }],
    })
}

/// `keep` blocks, a horizontal rule, an H2 with the dropped title, then the `drop` blocks.
pub fn merge_duplicate_content_value(keep: &Value, drop: &Value, drop_title: &str) -> Value {
    let blocks = |v: &Value| v.get("content").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut content = blocks(keep);
    content.push(json!({ "type": "horizontalRule" }));
    content.push(drop_heading(drop_title));
    content.extend(blocks(drop));
    json!({ "type": "doc", "content": content })
}

/// String-in / string-out variant matching `mergeDuplicateContent`.
pub fn merge_duplicate_content(keep_json: &str, drop_json: &str, drop_title: &str) -> String {
    let mut content = parse_doc_content(keep_json);
    content.push(json!({ "type": "horizontalRule" }));
    content.push(drop_heading(drop_title));
    content.extend(parse_doc_content(drop_json));
    serde_json::to_string(&MergedDoc { doc_type: "doc", content }).unwrap_or_else(|_| "{}".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(s: &str) -> Value {
        serde_json::from_str(s).unwrap()
    }

    #[test]
    fn merges_with_rule_and_heading() {
        let keep = r#"{"type":"doc","content":[{"type":"paragraph"}]}"#;
        let drop = r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x"}]}]}"#;
        let out = parsed(&merge_duplicate_content(keep, drop, "  Old  "));
        let content = out["content"].as_array().unwrap();
        assert_eq!(out["type"], "doc");
        assert_eq!(content.len(), 4);
        assert_eq!(content[1]["type"], "horizontalRule");
        assert_eq!(content[2]["attrs"]["level"], 2);
        assert_eq!(content[2]["content"][0]["text"], "Old");
        assert_eq!(content[3]["content"][0]["text"], "x");
    }

    #[test]
    fn tolerates_garbage_and_blank_title() {
        let out = parsed(&merge_duplicate_content("nope", "null", "   "));
        let content = out["content"].as_array().unwrap();
        assert_eq!(content.len(), 2);
        assert_eq!(content[1]["content"][0]["text"], "Untitled");

        let out = parsed(&merge_duplicate_content(r#"{"content":"str"}"#, "5", ""));
        assert_eq!(out["content"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn string_and_value_variants_agree() {
        let keep = r#"{"type":"doc","content":[{"type":"paragraph"}]}"#;
        let drop = r#"{"type":"doc","content":[{"type":"paragraph"}]}"#;
        let from_str = parsed(&merge_duplicate_content(keep, drop, "T"));
        let from_val = merge_duplicate_content_value(&parsed(keep), &parsed(drop), "T");
        assert_eq!(from_str, from_val);
    }

    #[test]
    fn keeps_type_before_content_in_output() {
        let s = merge_duplicate_content("{}", "{}", "T");
        assert!(s.starts_with(r#"{"type":"doc","content":["#));
    }
}
