use serde::Serialize;
use serde_json::Value;

use crate::dates::extract_due_hint;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTask {
    pub text: String,
    pub checked: bool,
    pub source: String,
    pub due_hint: Option<String>,
    pub document_id: Option<String>,
    pub document_title: Option<String>,
}

pub fn extract_checkbox_tasks(content_json: &str) -> Vec<DocumentTask> {
    let Ok(value) = serde_json::from_str::<Value>(content_json) else {
        return Vec::new();
    };
    let mut tasks = Vec::new();
    collect_checkbox_tasks(&value, &mut tasks);
    tasks
}

fn collect_checkbox_tasks(value: &Value, tasks: &mut Vec<DocumentTask>) {
    let Some(obj) = value.as_object() else {
        return;
    };
    if obj.get("type").and_then(|item| item.as_str()) == Some("taskItem") {
        let checked = obj
            .get("attrs")
            .and_then(|attrs| attrs.get("checked"))
            .and_then(|item| item.as_bool())
            .unwrap_or(false);
        let text = node_plain_text(value);
        if !text.trim().is_empty() {
            let due_hint = extract_due_hint(&text);
            tasks.push(DocumentTask {
                text,
                checked,
                source: "checkbox".to_string(),
                due_hint,
                document_id: None,
                document_title: None,
            });
        }
    }
    if let Some(content) = obj.get("content").and_then(|item| item.as_array()) {
        for child in content {
            collect_checkbox_tasks(child, tasks);
        }
    }
}

fn node_plain_text(value: &Value) -> String {
    if let Some(text) = value.get("text").and_then(|item| item.as_str()) {
        return text.to_string();
    }
    let mut parts = Vec::new();
    if let Some(content) = value.get("content").and_then(|item| item.as_array()) {
        for child in content {
            let part = node_plain_text(child);
            if !part.is_empty() {
                parts.push(part);
            }
        }
    }
    parts.join("")
}

pub fn merge_document_tasks(mut tasks: Vec<DocumentTask>) -> Vec<DocumentTask> {
    let mut index_by_key = std::collections::HashMap::<String, usize>::new();
    let mut merged: Vec<DocumentTask> = Vec::new();
    for task in tasks.drain(..) {
        let key = task.text.to_lowercase();
        if let Some(&idx) = index_by_key.get(&key) {
            if merged[idx].due_hint.is_none() && task.due_hint.is_some() {
                merged[idx].due_hint = task.due_hint;
            }
            continue;
        }
        index_by_key.insert(key, merged.len());
        merged.push(task);
    }
    merged
}

pub fn append_phrase_tasks(
    tasks: &mut Vec<DocumentTask>,
    sidecar_json: &Value,
    document_id: &str,
    document_title: &str,
) {
    let Some(items) = sidecar_json.get("tasks").and_then(|value| value.as_array()) else {
        return;
    };
    for item in items {
        let Some(body) = item.get("text").and_then(|value| value.as_str()) else {
            continue;
        };
        let due_hint = item
            .get("dueHint")
            .and_then(|value| value.as_str())
            .map(str::to_string)
            .or_else(|| extract_due_hint(body));
        tasks.push(DocumentTask {
            text: body.to_string(),
            checked: item
                .get("checked")
                .and_then(|value| value.as_bool())
                .unwrap_or(false),
            source: item
                .get("source")
                .and_then(|value| value.as_str())
                .unwrap_or("phrase")
                .to_string(),
            due_hint,
            document_id: Some(document_id.to_string()),
            document_title: Some(document_title.to_string()),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checkbox_extracts_due_hint() {
        let json = r#"{"type":"doc","content":[{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"text","text":"Ship release do 15.3.2026"}]}]}"#;
        let tasks = extract_checkbox_tasks(json);
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].due_hint.as_deref(), Some("2026-03-15"));
    }

    #[test]
    fn merge_prefers_due_hint() {
        let merged = merge_document_tasks(vec![
            DocumentTask {
                text: "Ship".into(),
                checked: false,
                source: "checkbox".into(),
                due_hint: None,
                document_id: None,
                document_title: None,
            },
            DocumentTask {
                text: "Ship".into(),
                checked: false,
                source: "phrase".into(),
                due_hint: Some("2026-09-07".into()),
                document_id: None,
                document_title: None,
            },
        ]);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].due_hint.as_deref(), Some("2026-09-07"));
    }
}
