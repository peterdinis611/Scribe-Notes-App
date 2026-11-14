//! Whats New edition highlights (i18n keys live in FE locales).

/// Edition 5.4 highlight ids — must match `whatsNew.*` keys in en/sk.json.
pub const WHATS_NEW_50_HIGHLIGHTS: &[&str] = &[
    "offlineAiFelt",
    "searchRewrite",
    "aiSurface",
    "pythonParity",
    "stillLocal",
];

/// Folio tag keys under `whatsNew.tags.*` for the 5.4 edition.
pub const WHATS_NEW_50_TAG_KEYS: &[&str] = &["localAi", "library", "agent"];

/// Deprecated alias — prefer [`WHATS_NEW_50_HIGHLIGHTS`].
pub const WHATS_NEW_40_HIGHLIGHTS: &[&str] = WHATS_NEW_50_HIGHLIGHTS;
/// Deprecated alias — prefer [`WHATS_NEW_50_TAG_KEYS`].
pub const WHATS_NEW_40_TAG_KEYS: &[&str] = WHATS_NEW_50_TAG_KEYS;

pub const EDITION_MARK_KEY: &str = "whatsNew.editionMark";

pub fn whats_new_highlights() -> Vec<String> {
    WHATS_NEW_50_HIGHLIGHTS
        .iter()
        .map(|id| (*id).to_string())
        .collect()
}

pub fn whats_new_tag_keys() -> Vec<String> {
    WHATS_NEW_50_TAG_KEYS
        .iter()
        .map(|id| (*id).to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_five_highlights() {
        assert_eq!(WHATS_NEW_50_HIGHLIGHTS.len(), 5);
        assert!(WHATS_NEW_50_HIGHLIGHTS.contains(&"offlineAiFelt"));
        assert_eq!(whats_new_tag_keys(), vec!["localAi", "library", "agent"]);
    }
}
