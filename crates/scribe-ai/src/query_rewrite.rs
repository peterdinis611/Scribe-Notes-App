//! Offline query rewrite / expansion (Rust fallback).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QueryRewrite {
    pub query: String,
    pub rewritten: String,
    pub expansions: Vec<String>,
    pub source: String,
}

/// Light rewrite: fold case/whitespace, expand a few EN/SK synonyms.
pub fn rewrite_query(query: &str) -> QueryRewrite {
    let trimmed = query.split_whitespace().collect::<Vec<_>>().join(" ");
    let lower = trimmed.to_lowercase();
    let mut expansions = Vec::new();

    let pairs: &[(&str, &[&str])] = &[
        ("deadline", &["due date", "termín", "dátum odovzdania"]),
        ("meeting", &["call", "porada", "stretnutie"]),
        ("summary", &["tl;dr", "súhrn", "zhrnutie"]),
        ("task", &["todo", "úloha", "action"]),
        ("termín", &["deadline", "due date"]),
        ("porada", &["meeting", "call"]),
        ("súhrn", &["summary", "zhrnutie"]),
        ("úloha", &["task", "todo"]),
    ];

    for (needle, extras) in pairs {
        if lower.split_whitespace().any(|token| token == *needle)
            || lower.contains(needle)
        {
            for extra in *extras {
                if !expansions.iter().any(|item| item == extra) {
                    expansions.push((*extra).to_string());
                }
            }
        }
    }
    expansions.truncate(6);

    let rewritten = if expansions.is_empty() {
        trimmed.clone()
    } else {
        format!("{trimmed} {}", expansions.join(" "))
    };

    QueryRewrite {
        query: trimmed,
        rewritten,
        expansions,
        source: "rust".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_deadline() {
        let result = rewrite_query("project deadline");
        assert!(result.expansions.iter().any(|item| item.contains("due") || item.contains("termín")));
        assert!(result.rewritten.contains("deadline"));
    }
}
