//! Whats New edition highlights (i18n keys live in FE locales).

/// Edition 4.0 highlight ids — must match `whatsNew.*` keys in en/sk.json.
pub const WHATS_NEW_40_HIGHLIGHTS: &[&str] = &[
    "pageWorkspace",
    "editorCanvas",
    "welcomeHome",
    "auditInsights",
    "skinPicker",
];

/// Folio tag keys under `whatsNew.tags.*` for the 4.0 edition.
pub const WHATS_NEW_40_TAG_KEYS: &[&str] = &["workspace", "design", "audit"];

pub const EDITION_MARK_KEY: &str = "whatsNew.editionMark";

pub fn whats_new_highlights() -> Vec<String> {
    WHATS_NEW_40_HIGHLIGHTS
        .iter()
        .map(|id| (*id).to_string())
        .collect()
}

pub fn whats_new_tag_keys() -> Vec<String> {
    WHATS_NEW_40_TAG_KEYS
        .iter()
        .map(|id| (*id).to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_five_highlights() {
        assert_eq!(WHATS_NEW_40_HIGHLIGHTS.len(), 5);
        assert!(WHATS_NEW_40_HIGHLIGHTS.contains(&"pageWorkspace"));
        assert_eq!(whats_new_tag_keys(), vec!["workspace", "design", "audit"]);
    }
}
