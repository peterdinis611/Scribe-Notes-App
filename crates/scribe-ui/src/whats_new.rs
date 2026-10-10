//! Whats New edition highlights (i18n keys live in FE locales).

/// Edition 3.4 highlight ids — must match `whatsNew.*` keys in en/sk.json.
pub const WHATS_NEW_34_HIGHLIGHTS: &[&str] = &[
    "specialistAgents",
    "agentHandoffs",
    "digestsRecipes",
    "spawnAndCalendar",
    "filesIngest",
];

pub const EDITION_MARK_KEY: &str = "whatsNew.editionMark";

pub fn whats_new_highlights() -> Vec<String> {
    WHATS_NEW_34_HIGHLIGHTS
        .iter()
        .map(|id| (*id).to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_five_highlights() {
        assert_eq!(WHATS_NEW_34_HIGHLIGHTS.len(), 5);
        assert!(WHATS_NEW_34_HIGHLIGHTS.contains(&"specialistAgents"));
    }
}
