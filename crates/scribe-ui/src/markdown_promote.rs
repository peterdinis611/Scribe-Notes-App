//! Promote fenced code blocks to first-class editor nodes after Markdown parse
//! (`src/lib/editor/markdown-promote.ts`). Operates on TipTap `JSONContent` as `serde_json::Value`.

use serde_json::{json, Map, Value};

use crate::map_spec::MAP_DEFAULT_SOURCE;

pub const D3_CHART_DEFAULT_SOURCE: &str = r#"{
  "type": "bar",
  "title": "Q1",
  "x": "month",
  "y": "value",
  "data": [
    { "month": "Jan", "value": 12 },
    { "month": "Feb", "value": 19 },
    { "month": "Mar", "value": 15 }
  ]
}"#;

pub const MERMAID_DEFAULT_SOURCE: &str = "flowchart TD\n  A --> B";

fn code_block_text(node: &Value) -> String {
    node.get("content")
        .and_then(Value::as_array)
        .map(|children| {
            children
                .iter()
                .map(|c| c.get("text").and_then(Value::as_str).unwrap_or(""))
                .collect::<String>()
        })
        .unwrap_or_default()
}

fn language_of(node: &Value) -> String {
    match node.get("attrs").and_then(|a| a.get("language")) {
        None | Some(Value::Null) => String::new(),
        Some(Value::String(s)) => s.to_lowercase().trim().to_string(),
        Some(other) => other.to_string().to_lowercase().trim().to_string(),
    }
}

fn or_default<'a>(text: &'a str, default: &'a str) -> &'a str {
    if text.is_empty() { default } else { text }
}

fn promote_code_block(node: &Value) -> Option<Value> {
    let language = language_of(node);
    let text = code_block_text(node);
    let text = text.trim();
    Some(match language.as_str() {
        "mermaid" => json!({
            "type": "mermaidDiagram",
            "attrs": { "source": or_default(text, MERMAID_DEFAULT_SOURCE) }
        }),
        "chart" | "d3" | "d3chart" => json!({
            "type": "d3Chart",
            "attrs": { "source": or_default(text, D3_CHART_DEFAULT_SOURCE) }
        }),
        "math" => json!({ "type": "mathBlock", "attrs": { "expression": text } }),
        "video" => json!({
            "type": "video",
            "attrs": { "src": if text.is_empty() { Value::Null } else { Value::String(text.into()) } }
        }),
        "map" | "leaflet" => json!({
            "type": "leafletMap",
            "attrs": { "source": or_default(text, MAP_DEFAULT_SOURCE) }
        }),
        _ => return None,
    })
}

fn promote_node(node: &Value) -> Value {
    if node.get("type").and_then(Value::as_str) == Some("codeBlock") {
        if let Some(promoted) = promote_code_block(node) {
            return promoted;
        }
    }

    let has_children = node
        .get("content")
        .and_then(Value::as_array)
        .is_some_and(|c| !c.is_empty());
    if !has_children {
        return node.clone();
    }

    let mut out: Map<String, Value> = node.as_object().cloned().unwrap_or_default();
    let promoted: Vec<Value> = node["content"].as_array().unwrap().iter().map(promote_node).collect();
    out.insert("content".into(), Value::Array(promoted));
    Value::Object(out)
}

/// Promote ```mermaid / ```chart / ```math / ```video / ```map code blocks into dedicated nodes.
/// Non-`doc` input yields an empty doc.
pub fn promote_markdown_special_blocks(doc: &Value) -> Value {
    if doc.get("type").and_then(Value::as_str) != Some("doc") {
        return json!({ "type": "doc", "content": [] });
    }
    promote_node(doc)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn code(lang: &str, text: &str) -> Value {
        json!({ "type": "codeBlock", "attrs": { "language": lang }, "content": [{ "type": "text", "text": text }] })
    }

    fn doc(children: Vec<Value>) -> Value {
        json!({ "type": "doc", "content": children })
    }

    #[test]
    fn non_doc_becomes_empty_doc() {
        assert_eq!(promote_markdown_special_blocks(&json!(null)), json!({"type":"doc","content":[]}));
        assert_eq!(promote_markdown_special_blocks(&json!({"type":"paragraph"})), json!({"type":"doc","content":[]}));
    }

    #[test]
    fn promotes_known_languages() {
        let out = promote_markdown_special_blocks(&doc(vec![
            code("Mermaid", "  graph LR; A-->B  "),
            code("d3", ""),
            code("math", " x^2 "),
            code("video", " https://v "),
            code("leaflet", ""),
        ]));
        let c = out["content"].as_array().unwrap();
        assert_eq!(c[0], json!({"type":"mermaidDiagram","attrs":{"source":"graph LR; A-->B"}}));
        assert_eq!(c[1]["type"], "d3Chart");
        assert_eq!(c[1]["attrs"]["source"], D3_CHART_DEFAULT_SOURCE);
        assert_eq!(c[2], json!({"type":"mathBlock","attrs":{"expression":"x^2"}}));
        assert_eq!(c[3], json!({"type":"video","attrs":{"src":"https://v"}}));
        assert_eq!(c[4]["attrs"]["source"], MAP_DEFAULT_SOURCE);
    }

    #[test]
    fn empty_mermaid_and_video_defaults() {
        let out = promote_markdown_special_blocks(&doc(vec![code("mermaid", ""), code("video", "")]));
        assert_eq!(out["content"][0]["attrs"]["source"], MERMAID_DEFAULT_SOURCE);
        assert!(out["content"][1]["attrs"]["src"].is_null());
    }

    #[test]
    fn leaves_other_code_and_recurses() {
        let rust = code("rust", "fn main() {}");
        let nested = json!({ "type": "blockquote", "content": [code("mermaid", "A-->B")] });
        let out = promote_markdown_special_blocks(&doc(vec![rust.clone(), nested]));
        assert_eq!(out["content"][0], rust);
        assert_eq!(out["content"][1]["content"][0]["type"], "mermaidDiagram");
    }

    #[test]
    fn code_block_without_attrs_is_untouched() {
        let node = json!({ "type": "codeBlock", "content": [{ "type": "text", "text": "x" }] });
        assert_eq!(promote_markdown_special_blocks(&doc(vec![node.clone()]))["content"][0], node);
    }
}
