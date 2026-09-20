//! Merge chapter documents into a single TipTap document, mirroring
//! `src/lib/library/compile-chapters.ts`.

use serde_json::{json, Value};

/// Merge `(title, content_json)` chapters into one TipTap doc JSON string.
///
/// Every chapter contributes a level 1 heading with its title followed by the
/// chapter content nodes. Chapters whose JSON cannot be parsed are kept as a
/// single paragraph holding the raw text, so nothing is silently dropped.
pub fn merge_chapters(chapters: &[(String, String)]) -> Result<String, String> {
    let mut content: Vec<Value> = Vec::new();

    for (title, content_json) in chapters {
        content.push(json!({
            "type": "heading",
            "attrs": { "level": 1 },
            "content": [{ "type": "text", "text": title }],
        }));

        match serde_json::from_str::<Value>(content_json) {
            Ok(parsed) => {
                if let Some(nodes) = parsed.get("content").and_then(Value::as_array) {
                    content.extend(nodes.iter().cloned());
                }
            }
            Err(_) => content.push(json!({
                "type": "paragraph",
                "content": [{ "type": "text", "text": content_json }],
            })),
        }
    }

    serde_json::to_string(&json!({ "type": "doc", "content": content }))
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_headings_and_chapter_content() {
        let merged = merge_chapters(&[
            (
                "First".to_string(),
                r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"one"}]}]}"#
                    .to_string(),
            ),
            (
                "Second".to_string(),
                r#"{"type":"doc","content":[{"type":"paragraph"}]}"#.to_string(),
            ),
        ])
        .unwrap();

        let doc: Value = serde_json::from_str(&merged).unwrap();
        assert_eq!(doc["type"], "doc");

        let nodes = doc["content"].as_array().unwrap();
        assert_eq!(nodes.len(), 4);
        assert_eq!(nodes[0]["type"], "heading");
        assert_eq!(nodes[0]["attrs"]["level"], 1);
        assert_eq!(nodes[0]["content"][0]["text"], "First");
        assert_eq!(nodes[1]["content"][0]["text"], "one");
        assert_eq!(nodes[2]["content"][0]["text"], "Second");
        assert_eq!(nodes[3]["type"], "paragraph");
    }

    #[test]
    fn unparsable_chapter_becomes_raw_paragraph() {
        let merged = merge_chapters(&[("Notes".to_string(), "not json at all".to_string())]).unwrap();
        let doc: Value = serde_json::from_str(&merged).unwrap();
        let nodes = doc["content"].as_array().unwrap();

        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[1]["type"], "paragraph");
        assert_eq!(nodes[1]["content"][0]["text"], "not json at all");
    }

    #[test]
    fn empty_chapter_list_yields_empty_doc() {
        let doc: Value = serde_json::from_str(&merge_chapters(&[]).unwrap()).unwrap();
        assert_eq!(doc["type"], "doc");
        assert!(doc["content"].as_array().unwrap().is_empty());
    }

    #[test]
    fn chapter_without_content_array_contributes_only_heading() {
        let merged =
            merge_chapters(&[("Only".to_string(), r#"{"type":"doc"}"#.to_string())]).unwrap();
        let doc: Value = serde_json::from_str(&merged).unwrap();
        assert_eq!(doc["content"].as_array().unwrap().len(), 1);
    }
}
