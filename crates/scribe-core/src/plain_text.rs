use regex::Regex;
use serde_json::{json, Value};

pub type WikiTargetResolver = dyn Fn(&str) -> Option<String>;

pub fn tiptap_to_plain_text(content_json: &str) -> String {
    let Ok(doc) = serde_json::from_str::<Value>(content_json) else {
        return String::new();
    };
    let blocks = doc
        .get("content")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|node| {
                    let text = block_to_plain(node);
                    if text.trim().is_empty() {
                        None
                    } else {
                        Some(text)
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    blocks.join("\n\n")
}

pub fn plain_text_to_tiptap(text: &str, resolve_wiki: Option<&WikiTargetResolver>) -> String {
    let normalized = text.replace("\r\n", "\n");
    let lines: Vec<&str> = normalized.split('\n').collect();
    let content = if lines.is_empty() || (lines.len() == 1 && lines[0].is_empty()) {
        vec![json!({ "type": "paragraph" })]
    } else {
        lines
            .iter()
            .map(|line| paragraph_node(line, resolve_wiki))
            .collect()
    };
    serde_json::to_string(&json!({ "type": "doc", "content": content })).unwrap_or_else(|_| {
        r#"{"type":"doc","content":[{"type":"paragraph"}]}"#.to_string()
    })
}

pub fn plain_text_to_paragraph_nodes(
    text: &str,
    resolve_wiki: Option<&WikiTargetResolver>,
) -> Vec<Value> {
    let normalized = text.replace("\r\n", "\n");
    let lines: Vec<&str> = normalized.split('\n').collect();
    if lines.is_empty() {
        return vec![json!({ "type": "paragraph" })];
    }
    lines
        .iter()
        .map(|line| paragraph_node(line, resolve_wiki))
        .collect()
}

fn paragraph_node(line: &str, resolve_wiki: Option<&WikiTargetResolver>) -> Value {
    let text = line.trim_end();
    if text.is_empty() {
        return json!({ "type": "paragraph" });
    }
    json!({
        "type": "paragraph",
        "content": inline_content_from_text(text, resolve_wiki),
    })
}

fn inline_content_from_text(text: &str, resolve_wiki: Option<&WikiTargetResolver>) -> Vec<Value> {
    if resolve_wiki.is_none() || !text.contains("[[") {
        return vec![json!({ "type": "text", "text": text })];
    }

    static WIKI: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let pattern = WIKI.get_or_init(|| Regex::new(r"\[\[([^\]]+)\]\]").expect("wiki regex"));
    let mut nodes = Vec::new();
    let mut last = 0usize;

    for cap in pattern.captures_iter(text) {
        let m = cap.get(0).unwrap();
        if m.start() > last {
            nodes.push(json!({ "type": "text", "text": &text[last..m.start()] }));
        }
        let label = cap.get(1).map(|item| item.as_str().trim()).unwrap_or("");
        if !label.is_empty() {
            let target_id = resolve_wiki.and_then(|resolver| resolver(label));
            nodes.push(json!({
                "type": "wikiLink",
                "attrs": { "targetId": target_id, "label": label },
            }));
        }
        last = m.end();
    }

    if last < text.len() {
        nodes.push(json!({ "type": "text", "text": &text[last..] }));
    }

    if nodes.is_empty() {
        nodes.push(json!({ "type": "text", "text": text }));
    }
    nodes
}

fn inline_text(value: &Value) -> String {
    if value.get("type").and_then(|item| item.as_str()) == Some("text") {
        return value
            .get("text")
            .and_then(|item| item.as_str())
            .unwrap_or("")
            .to_string();
    }
    if value.get("type").and_then(|item| item.as_str()) == Some("hardBreak") {
        return "\n".to_string();
    }
    if value.get("type").and_then(|item| item.as_str()) == Some("wikiLink") {
        let label = value
            .pointer("/attrs/label")
            .and_then(|item| item.as_str())
            .unwrap_or("");
        return if label.is_empty() {
            String::new()
        } else {
            format!("[[{label}]]")
        };
    }
    value
        .get("content")
        .and_then(|item| item.as_array())
        .map(|items| items.iter().map(inline_text).collect::<String>())
        .unwrap_or_default()
}

fn block_to_plain(value: &Value) -> String {
    match value.get("type").and_then(|item| item.as_str()) {
        Some("heading") | Some("paragraph") => inline_text(value),
        Some("blockquote") => value
            .get("content")
            .and_then(|item| item.as_array())
            .map(|items| {
                items
                    .iter()
                    .map(block_to_plain)
                    .filter(|text| !text.is_empty())
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default(),
        Some("bulletList") => value
            .get("content")
            .and_then(|item| item.as_array())
            .map(|items| {
                items
                    .iter()
                    .map(|item| {
                        let text = item
                            .get("content")
                            .and_then(|content| content.as_array())
                            .map(|children| {
                                children
                                    .iter()
                                    .map(block_to_plain)
                                    .filter(|part| !part.is_empty())
                                    .collect::<Vec<_>>()
                                    .join("\n")
                            })
                            .unwrap_or_default();
                        format!("- {text}")
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default(),
        Some("orderedList") => value
            .get("content")
            .and_then(|item| item.as_array())
            .map(|items| {
                items
                    .iter()
                    .enumerate()
                    .map(|(index, item)| {
                        let text = item
                            .get("content")
                            .and_then(|content| content.as_array())
                            .map(|children| {
                                children
                                    .iter()
                                    .map(block_to_plain)
                                    .filter(|part| !part.is_empty())
                                    .collect::<Vec<_>>()
                                    .join("\n")
                            })
                            .unwrap_or_default();
                        format!("{}. {text}", index + 1)
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default(),
        Some("taskList") => value
            .get("content")
            .and_then(|item| item.as_array())
            .map(|items| {
                items
                    .iter()
                    .map(|item| {
                        let checked = item
                            .pointer("/attrs/checked")
                            .and_then(|value| value.as_bool())
                            .unwrap_or(false);
                        let mark = if checked { "☑" } else { "☐" };
                        let text = item
                            .get("content")
                            .and_then(|content| content.as_array())
                            .map(|children| {
                                children
                                    .iter()
                                    .map(block_to_plain)
                                    .filter(|part| !part.is_empty())
                                    .collect::<Vec<_>>()
                                    .join("\n")
                            })
                            .unwrap_or_default();
                        format!("{mark} {text}")
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default(),
        Some("horizontalRule") => "---".to_string(),
        Some("codeBlock") => inline_text(value),
        _ => value
            .get("content")
            .and_then(|item| item.as_array())
            .map(|items| {
                items
                    .iter()
                    .map(block_to_plain)
                    .filter(|text| !text.is_empty())
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default(),
    }
}
