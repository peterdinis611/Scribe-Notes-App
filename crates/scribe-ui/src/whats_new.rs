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

/// @deprecated Prefer [`WHATS_NEW_40_HIGHLIGHTS`].
pub const WHATS_NEW_39_HIGHLIGHTS: &[&str] = WHATS_NEW_40_HIGHLIGHTS;
/// @deprecated Prefer [`WHATS_NEW_40_TAG_KEYS`].
pub const WHATS_NEW_39_TAG_KEYS: &[&str] = WHATS_NEW_40_TAG_KEYS;

/// @deprecated Prefer [`WHATS_NEW_40_TAG_KEYS`].
pub const WHATS_NEW_38_TAG_KEYS: &[&str] = WHATS_NEW_40_TAG_KEYS;
/// @deprecated Prefer [`WHATS_NEW_40_TAG_KEYS`].
pub const WHATS_NEW_37_TAG_KEYS: &[&str] = WHATS_NEW_40_TAG_KEYS;
/// @deprecated Prefer [`WHATS_NEW_40_TAG_KEYS`].
pub const WHATS_NEW_36_TAG_KEYS: &[&str] = WHATS_NEW_40_TAG_KEYS;

/// @deprecated Prefer [`WHATS_NEW_40_HIGHLIGHTS`].
pub const WHATS_NEW_38_HIGHLIGHTS: &[&str] = WHATS_NEW_40_HIGHLIGHTS;
/// @deprecated Prefer [`WHATS_NEW_40_HIGHLIGHTS`].
pub const WHATS_NEW_37_HIGHLIGHTS: &[&str] = WHATS_NEW_40_HIGHLIGHTS;
/// @deprecated Prefer [`WHATS_NEW_40_HIGHLIGHTS`].
pub const WHATS_NEW_36_HIGHLIGHTS: &[&str] = WHATS_NEW_40_HIGHLIGHTS;
/// @deprecated Prefer [`WHATS_NEW_40_HIGHLIGHTS`].
pub const WHATS_NEW_35_HIGHLIGHTS: &[&str] = WHATS_NEW_40_HIGHLIGHTS;
/// @deprecated Prefer [`WHATS_NEW_40_HIGHLIGHTS`].
pub const WHATS_NEW_34_HIGHLIGHTS: &[&str] = WHATS_NEW_40_HIGHLIGHTS;

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
