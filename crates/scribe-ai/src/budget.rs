//! Passage / prompt budget trimming before LLM calls.

use serde_json::{json, Value};

/// Soft cap for total snippet characters sent to a model.
pub const DEFAULT_PASSAGE_CHAR_BUDGET: usize = 12_000;

/// Trim a JSON array of passage objects (`snippet` field) to fit a character budget.
/// Keeps order; drops from the end. Empty / non-array input is returned unchanged.
pub fn trim_passages_to_char_budget(passages: Value, budget: usize) -> Value {
    let budget = if budget == 0 {
        DEFAULT_PASSAGE_CHAR_BUDGET
    } else {
        budget.max(1)
    };
    let Some(items) = passages.as_array() else {
        return passages;
    };
    let mut kept = Vec::new();
    let mut used = 0usize;
    for item in items {
        let snippet = item
            .get("snippet")
            .and_then(Value::as_str)
            .unwrap_or("");
        let cost = snippet.chars().count().max(1);
        if !kept.is_empty() && used + cost > budget {
            break;
        }
        if kept.is_empty() && cost > budget {
            // Always keep at least a truncated first passage.
            let mut truncated = item.clone();
            if let Some(object) = truncated.as_object_mut() {
                let clipped: String = snippet.chars().take(budget).collect();
                object.insert("snippet".into(), json!(clipped));
            }
            kept.push(truncated);
            break;
        }
        used += cost;
        kept.push(item.clone());
    }
    json!(kept)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drops_tail_when_over_budget() {
        let passages = json!([
            { "snippet": "aaaa" },
            { "snippet": "bbbb" },
            { "snippet": "cccccccc" },
        ]);
        let trimmed = trim_passages_to_char_budget(passages, 10);
        let list = trimmed.as_array().unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0]["snippet"], "aaaa");
        assert_eq!(list[1]["snippet"], "bbbb");
    }
}
