//! Known specialist agent role ids (logical DB partitions).

pub const DEFAULT_AGENT_ID: &str = "general";

pub const AGENT_ROLE_IDS: &[&str] = &[
    "general",
    "proofreader",
    "librarian",
    "meeting",
    "study",
    "organizer",
];

/// Normalize a role / persona string into a known `agent_id`.
pub fn normalize_agent_id(raw: Option<&str>) -> String {
    let Some(value) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return DEFAULT_AGENT_ID.into();
    };
    match value.to_ascii_lowercase().as_str() {
        "general" | "default" | "main" => "general".into(),
        "proofreader" | "spellcheck" | "spell" | "grammar" => "proofreader".into(),
        "librarian" | "library" | "wiki" => "librarian".into(),
        "meeting" | "meetings" | "notes" => "meeting".into(),
        "study" | "learning" | "flashcards" => "study".into(),
        "organizer" | "organise" | "organize" | "tasks" => "organizer".into(),
        _ => DEFAULT_AGENT_ID.into(),
    }
}

/// Infer agent_id when only a teaching topic is known.
pub fn agent_id_for_topic(topic: &str) -> String {
    match topic.trim().to_ascii_lowercase().as_str() {
        "grammar" | "spelling" | "spellcheck" => "proofreader".into(),
        _ => DEFAULT_AGENT_ID.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persona_aliases() {
        assert_eq!(normalize_agent_id(Some("spellcheck")), "proofreader");
        assert_eq!(normalize_agent_id(Some("Librarian")), "librarian");
        assert_eq!(normalize_agent_id(None), "general");
    }
}
