use serde_json::{json, Value};

pub const DOCUMENT_CHAT_CONTEXT_LIMIT: usize = 16;
pub const DOCUMENT_CHAT_RECENT_TURNS: usize = 8;
pub const MERGED_PASSAGE_LIMIT: usize = 20;
const RECENT_SNIPPET_CHARS: usize = 480;
const DIGEST_TURN_CHARS: usize = 160;

#[derive(Debug, Clone)]
pub struct ChatTurn {
    pub role: String,
    pub text: String,
}

pub fn merge_chat_memory_passages(
    document_id: &str,
    title: &str,
    passages: Value,
    turns: &[ChatTurn],
) -> Value {
    let mut combined = Vec::new();
    if let Some(docs) = passages.as_array() {
        combined.extend(docs.iter().cloned());
    }
    combined.extend(chat_memory_passages(document_id, title, turns));
    combined.truncate(MERGED_PASSAGE_LIMIT);
    json!(combined)
}

pub fn is_chat_memory_citation_title(title: &str) -> bool {
    let lower = title.to_ascii_lowercase();
    lower.contains("chat memory") || lower.contains("earlier chat")
}

pub fn followups_from_sidecar(result: &Value) -> Vec<String> {
    result
        .get("followups")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .take(4)
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn clip(text: &str, max: usize) -> String {
    let trimmed = text.trim();
    let count = trimmed.chars().count();
    if count <= max {
        return trimmed.to_string();
    }
    let mut out: String = trimmed.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

fn chat_memory_passages(document_id: &str, title: &str, turns: &[ChatTurn]) -> Vec<Value> {
    let cleaned: Vec<&ChatTurn> = turns
        .iter()
        .filter(|turn| !turn.text.trim().is_empty())
        .collect();
    if cleaned.is_empty() {
        return Vec::new();
    }

    let start = cleaned.len().saturating_sub(DOCUMENT_CHAT_CONTEXT_LIMIT);
    let window = &cleaned[start..];
    let recent_at = window.len().saturating_sub(DOCUMENT_CHAT_RECENT_TURNS);
    let older = &window[..recent_at];
    let recent = &window[recent_at..];

    let mut out = Vec::new();
    if !older.is_empty() {
        let digest = older
            .iter()
            .map(|turn| {
                let label = if turn.role.eq_ignore_ascii_case("assistant") {
                    "A"
                } else {
                    "Q"
                };
                format!("{label}: {}", clip(&turn.text, DIGEST_TURN_CHARS))
            })
            .collect::<Vec<_>>()
            .join("\n");
        out.push(json!({
            "documentId": document_id,
            "title": format!("{title} · earlier chat"),
            "snippet": format!("Earlier conversation on this note:\n{digest}"),
        }));
    }

    for turn in recent {
        let assistant = turn.role.eq_ignore_ascii_case("assistant");
        let label = if assistant {
            "Earlier assistant reply"
        } else {
            "Earlier user question"
        };
        out.push(json!({
            "documentId": document_id,
            "title": format!("{title} · chat memory"),
            "snippet": format!("{label}: {}", clip(&turn.text, RECENT_SNIPPET_CHARS)),
        }));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_document_chunks_ahead_of_memory() {
        let docs = json!([{
            "documentId": "d",
            "title": "Note",
            "snippet": "body chunk"
        }]);
        let turns = vec![
            ChatTurn {
                role: "user".into(),
                text: "What is the deadline?".into(),
            },
            ChatTurn {
                role: "assistant".into(),
                text: "Friday.".into(),
            },
        ];
        let merged = merge_chat_memory_passages("d", "Note", docs, &turns);
        let list = merged.as_array().expect("array");
        assert_eq!(list[0]["snippet"], "body chunk");
        let memory = list
            .iter()
            .filter_map(|item| item["title"].as_str())
            .any(|title| title.contains("chat memory"));
        assert!(memory);
        let joined = list
            .iter()
            .filter_map(|item| item["snippet"].as_str())
            .collect::<Vec<_>>()
            .join("\n");
        assert!(joined.contains("deadline"));
    }

    #[test]
    fn digests_older_turns_and_keeps_recent() {
        let turns: Vec<ChatTurn> = (0..12)
            .map(|index| ChatTurn {
                role: "user".into(),
                text: format!("question-{index} extra detail"),
            })
            .collect();
        let merged = merge_chat_memory_passages("d", "Note", json!([]), &turns);
        let list = merged.as_array().expect("array");
        assert!(list[0]["title"].as_str().unwrap().contains("earlier chat"));
        assert!(list[0]["snippet"].as_str().unwrap().contains("question-0"));
        assert!(list
            .last()
            .unwrap()["snippet"]
            .as_str()
            .unwrap()
            .contains("question-11"));
        assert_eq!(list.len(), 9);
    }

    #[test]
    fn parses_followups() {
        let result = json!({ "followups": ["Next?", "", "And then?"] });
        assert_eq!(followups_from_sidecar(&result), vec!["Next?", "And then?"]);
    }
}
