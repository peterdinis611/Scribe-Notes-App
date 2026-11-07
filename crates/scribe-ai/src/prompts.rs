//! Stable system / user prompt builders for local LLM calls.

use crate::budget::{trim_passages_to_char_budget, DEFAULT_PASSAGE_CHAR_BUDGET};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptKind {
    DocumentChat,
    LibraryChat,
    Agent,
    Rewrite,
}

pub fn system_prompt(kind: PromptKind, language: Option<&str>) -> String {
    let sk = language
        .map(|value| value.to_ascii_lowercase().starts_with("sk"))
        .unwrap_or(false);
    match (kind, sk) {
        (PromptKind::DocumentChat, false) => {
            "You are Scribe's document assistant. Answer only from the provided note passages. Cite titles when you use a passage. If the note does not contain the answer, say so."
                .into()
        }
        (PromptKind::DocumentChat, true) => {
            "Si asistent poznámky v Scribe. Odpovedaj len z poskytnutých pasáží. Cituj názvy, keď ich použiješ. Ak odpoveď v poznámke nie je, povedz to."
                .into()
        }
        (PromptKind::LibraryChat, false) => {
            "You are Scribe's library assistant. Use the ranked passages across notes. Prefer precise citations. Do not invent documents."
                .into()
        }
        (PromptKind::LibraryChat, true) => {
            "Si asistent knižnice Scribe. Použi zoradené pasáže z poznámok. Preferuj presné citácie. Nevymýšľaj dokumenty."
                .into()
        }
        (PromptKind::Agent, false) => {
            "You are Scribe's local agent planner. Propose concrete next tools and short answers. Stay within the user's library context."
                .into()
        }
        (PromptKind::Agent, true) => {
            "Si lokálny agent plánovač Scribe. Navrhni konkrétne nástroje a krátke odpovede. Zostaň v kontexte knižnice používateľa."
                .into()
        }
        (PromptKind::Rewrite, false) => {
            "You rewrite the user's note text. Preserve meaning and structure unless asked otherwise. Return only the rewritten text."
                .into()
        }
        (PromptKind::Rewrite, true) => {
            "Prepíšeš text poznámky. Zachovaj význam a štruktúru, pokiaľ nie je povedané inak. Vráť len prepísaný text."
                .into()
        }
    }
}

/// Build a user message: question + trimmed passage JSON (or plain text for rewrite).
pub fn user_prompt(
    kind: PromptKind,
    question_or_text: &str,
    passages: Option<Value>,
    char_budget: Option<usize>,
) -> String {
    let q = question_or_text.trim();
    match kind {
        PromptKind::Rewrite => q.to_string(),
        _ => {
            let budget = char_budget.unwrap_or(DEFAULT_PASSAGE_CHAR_BUDGET);
            let body = match passages {
                Some(value) => trim_passages_to_char_budget(value, budget).to_string(),
                None => "[]".into(),
            };
            format!("Question:\n{q}\n\nPassages (JSON):\n{body}")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn builds_document_chat_user_prompt() {
        let prompt = user_prompt(
            PromptKind::DocumentChat,
            "When is the deadline?",
            Some(json!([{ "title": "Note", "snippet": "Friday." }])),
            Some(2000),
        );
        assert!(prompt.contains("Friday."));
        assert!(prompt.contains("When is the deadline?"));
    }
}
