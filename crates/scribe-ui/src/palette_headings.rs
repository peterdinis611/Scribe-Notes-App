//! Collect heading labels from stored TipTap `contentJson`.

use serde_json::Value;

fn text_from_node(node: &Value) -> String {
    if let Some(text) = node.get("text").and_then(|t| t.as_str()) {
        return text.to_string();
    }
    let Some(children) = node.get("content").and_then(|c| c.as_array()) else {
        return String::new();
    };
    children.iter().map(text_from_node).collect()
}

pub fn collect_headings_from_json(content_json: &str) -> Vec<String> {
    let Ok(root) = serde_json::from_str::<Value>(content_json) else {
        return vec![];
    };
    let mut headings = Vec::new();
    fn walk(node: &Value, headings: &mut Vec<String>) {
        if node.get("type").and_then(|t| t.as_str()) == Some("heading") {
            let label = text_from_node(node).trim().to_string();
            if !label.is_empty() {
                headings.push(label);
            }
        }
        if let Some(children) = node.get("content").and_then(|c| c.as_array()) {
            for child in children {
                walk(child, headings);
            }
        }
    }
    walk(&root, &mut headings);
    headings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects() {
        let json = r#"{"type":"doc","content":[
          {"type":"heading","content":[{"type":"text","text":"One"}]},
          {"type":"paragraph","content":[{"type":"text","text":"x"}]},
          {"type":"heading","content":[{"type":"text","text":"Two"}]}
        ]}"#;
        assert_eq!(collect_headings_from_json(json), vec!["One", "Two"]);
    }
}
