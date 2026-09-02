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

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineItem {
    pub kind: String,
    pub level: i64,
    pub text: String,
}

pub fn document_outline(content_json: &str) -> Vec<OutlineItem> {
    let Ok(doc) = serde_json::from_str::<Value>(content_json) else {
        return Vec::new();
    };
    let mut items = Vec::new();
    collect_outline(&doc, &mut items);
    items
}

fn collect_outline(value: &Value, items: &mut Vec<OutlineItem>) {
    if let Some(obj) = value.as_object() {
        if obj.get("type").and_then(Value::as_str) == Some("heading") {
            let level = obj
                .get("attrs")
                .and_then(|attrs| attrs.get("level"))
                .and_then(Value::as_i64)
                .unwrap_or(1);
            let text = inline_text(value).trim().to_string();
            if !text.is_empty() {
                items.push(OutlineItem {
                    kind: "heading".to_string(),
                    level,
                    text,
                });
            }
        }
        if let Some(content) = obj.get("content").and_then(Value::as_array) {
            for child in content {
                collect_outline(child, items);
            }
        }
    } else if let Some(items_arr) = value.as_array() {
        for child in items_arr {
            collect_outline(child, items);
        }
    }
}

pub fn tiptap_to_markdown(content_json: &str) -> String {
    let Ok(doc) = serde_json::from_str::<Value>(content_json) else {
        return String::new();
    };
    let markdown = block_to_markdown(&doc).trim().to_string();
    markdown
}

fn block_to_markdown(value: &Value) -> String {
    match value.get("type").and_then(Value::as_str) {
        Some("doc") => value
            .get("content")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .map(block_to_markdown)
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default(),
        Some("heading") => {
            let level = value
                .pointer("/attrs/level")
                .and_then(Value::as_u64)
                .unwrap_or(1)
                .clamp(1, 6) as usize;
            format!("{} {}\n\n", "#".repeat(level), inline_text(value).trim())
        }
        Some("paragraph") => format!("{}\n\n", inline_text(value)),
        Some("blockquote") => value
            .get("content")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .map(|child| format!("> {}\n", inline_text(child).trim()))
                    .collect::<String>()
                    + "\n"
            })
            .unwrap_or_default(),
        Some("codeBlock") => {
            let lang = value
                .pointer("/attrs/language")
                .and_then(Value::as_str)
                .unwrap_or("");
            format!("```{lang}\n{}\n```\n\n", inline_text(value))
        }
        Some("horizontalRule") => "---\n\n".to_string(),
        Some("bulletList") => list_to_markdown(value, false),
        Some("orderedList") => list_to_markdown(value, true),
        Some("taskList") => value
            .get("content")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .map(|item| {
                        let checked = item
                            .pointer("/attrs/checked")
                            .and_then(Value::as_bool)
                            .unwrap_or(false);
                        let mark = if checked { "x" } else { " " };
                        let text = item
                            .get("content")
                            .and_then(Value::as_array)
                            .map(|children| {
                                children
                                    .iter()
                                    .map(block_to_plain)
                                    .filter(|part| !part.is_empty())
                                    .collect::<Vec<_>>()
                                    .join(" ")
                            })
                            .unwrap_or_default();
                        format!("- [{mark}] {text}\n")
                    })
                    .collect::<String>()
                    + "\n"
            })
            .unwrap_or_default(),
        _ => value
            .get("content")
            .and_then(Value::as_array)
            .map(|items| items.iter().map(block_to_markdown).collect::<String>())
            .unwrap_or_default(),
    }
}

fn list_to_markdown(value: &Value, ordered: bool) -> String {
    value
        .get("content")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .enumerate()
                .map(|(index, item)| {
                    let text = item
                        .get("content")
                        .and_then(Value::as_array)
                        .map(|children| {
                            children
                                .iter()
                                .map(block_to_plain)
                                .filter(|part| !part.is_empty())
                                .collect::<Vec<_>>()
                                .join(" ")
                        })
                        .unwrap_or_default();
                    if ordered {
                        format!("{}. {text}\n", index + 1)
                    } else {
                        format!("- {text}\n")
                    }
                })
                .collect::<String>()
                + "\n"
        })
        .unwrap_or_default()
}

/// Toggle or set the first task item whose text matches `needle` (case-insensitive).
/// Returns the new JSON and the resulting checked flag.
pub fn toggle_matching_task(
    content_json: &str,
    needle: &str,
    checked: Option<bool>,
) -> Result<(String, bool, String), String> {
    let needle = needle.trim();
    if needle.is_empty() {
        return Err("task text is required".to_string());
    }
    let mut doc: Value = serde_json::from_str(content_json).map_err(|e| e.to_string())?;
    let mut found = None;
    apply_task_toggle(&mut doc, needle, checked, &mut found);
    let Some((new_checked, matched_text)) = found else {
        return Err(format!("Open task not found: {needle}"));
    };
    let json = serde_json::to_string(&doc).map_err(|e| e.to_string())?;
    Ok((json, new_checked, matched_text))
}

fn apply_task_toggle(
    value: &mut Value,
    needle: &str,
    checked: Option<bool>,
    found: &mut Option<(bool, String)>,
) {
    if found.is_some() {
        return;
    }
    if value.get("type").and_then(Value::as_str) == Some("taskItem") {
        let text = node_plain_for_task(value);
        if text.trim().to_lowercase() == needle.to_lowercase() {
            let current = value
                .pointer("/attrs/checked")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let next = checked.unwrap_or(!current);
            if let Some(attrs) = value
                .as_object_mut()
                .and_then(|obj| obj.get_mut("attrs"))
                .and_then(Value::as_object_mut)
            {
                attrs.insert("checked".to_string(), json!(next));
            } else if let Some(obj) = value.as_object_mut() {
                obj.insert("attrs".to_string(), json!({ "checked": next }));
            }
            *found = Some((next, text));
            return;
        }
    }
    if let Some(content) = value.get_mut("content").and_then(Value::as_array_mut) {
        for child in content {
            apply_task_toggle(child, needle, checked, found);
            if found.is_some() {
                return;
            }
        }
    }
}

fn node_plain_for_task(value: &Value) -> String {
    if let Some(text) = value.get("text").and_then(Value::as_str) {
        return text.to_string();
    }
    value
        .get("content")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(node_plain_for_task)
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default()
}
