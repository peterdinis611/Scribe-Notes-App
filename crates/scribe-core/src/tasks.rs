use serde::Serialize;
use serde_json::Value;

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
            tasks.push(DocumentTask {
                text,
                checked,
                source: "checkbox".to_string(),
                due_hint: None,
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
    let mut seen = std::collections::HashSet::new();
    tasks.retain(|task| {
        let key = task.text.to_lowercase();
        if seen.contains(&key) {
            false
        } else {
            seen.insert(key);
            true
        }
    });
    tasks
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
            due_hint: item
                .get("dueHint")
                .and_then(|value| value.as_str())
                .map(str::to_string),
            document_id: Some(document_id.to_string()),
            document_title: Some(document_title.to_string()),
        });
    }
}
