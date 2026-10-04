//! Grammar teaching helpers for the Spellcheck Agent / MCP persona.

use crate::store::AgentTeaching;

/// Normalize a teaching topic to `general` or `grammar`.
pub fn normalize_topic(topic: &str) -> String {
    match topic.trim().to_ascii_lowercase().as_str() {
        "grammar" | "spelling" | "spellcheck" => "grammar".into(),
        _ => "general".into(),
    }
}

/// Standing-instruction / grammar blocks for agent memory (MCP + in-app).
pub fn memory_preamble(teachings: &[AgentTeaching], grammar_only: bool) -> Option<String> {
    let grammar: Vec<&AgentTeaching> = teachings
        .iter()
        .filter(|item| normalize_topic(&item.topic) == "grammar")
        .collect();
    let general: Vec<&AgentTeaching> = teachings
        .iter()
        .filter(|item| normalize_topic(&item.topic) != "grammar")
        .collect();

    let mut blocks: Vec<String> = Vec::new();
    if !grammar_only && !general.is_empty() {
        let body = general
            .iter()
            .map(|item| format!("• {}", item.text))
            .collect::<Vec<_>>()
            .join("\n");
        blocks.push(format!(
            "Standing instructions for the local agent (follow when relevant):\n{body}"
        ));
    }
    if !grammar.is_empty() {
        let body = grammar
            .iter()
            .map(|item| format!("• {}", item.text))
            .collect::<Vec<_>>()
            .join("\n");
        blocks.push(format!(
            "Grammar & spelling preferences (apply when checking, rewriting, or polishing text):\n{body}"
        ));
    }
    if blocks.is_empty() {
        None
    } else {
        Some(blocks.join("\n\n"))
    }
}

/// Texts of grammar-topic teachings only (for NLP `grammar_check` rules).
pub fn grammar_rule_texts(teachings: &[AgentTeaching]) -> Vec<String> {
    teachings
        .iter()
        .filter(|item| normalize_topic(&item.topic) == "grammar")
        .map(|item| item.text.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::AgentTeaching;

    fn teaching(text: &str, topic: &str) -> AgentTeaching {
        AgentTeaching {
            id: text.into(),
            text: text.into(),
            created_at: 0,
            topic: topic.into(),
            agent_id: if topic == "grammar" {
                "proofreader".into()
            } else {
                "general".into()
            },
        }
    }

    #[test]
    fn normalize_topic_aliases() {
        assert_eq!(normalize_topic("spelling"), "grammar");
        assert_eq!(normalize_topic("General"), "general");
    }

    #[test]
    fn preamble_grammar_only() {
        let teachings = vec![
            teaching("Prefer colour over color", "grammar"),
            teaching("Answer in Slovak", "general"),
        ];
        let text = memory_preamble(&teachings, true).unwrap();
        assert!(text.contains("Prefer colour"));
        assert!(!text.contains("Answer in Slovak"));
    }

    #[test]
    fn grammar_rules_extract() {
        let teachings = vec![
            teaching("Prefer colour over color", "grammar"),
            teaching("Answer in Slovak", "general"),
        ];
        let rules = grammar_rule_texts(&teachings);
        assert_eq!(rules, vec!["Prefer colour over color".to_string()]);
    }
}
