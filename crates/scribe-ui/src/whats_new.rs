//! Whats New edition highlights (i18n keys live in FE locales).

/// Edition 3.9 highlight ids — must match `whatsNew.*` keys in en/sk.json.
pub const WHATS_NEW_39_HIGHLIGHTS: &[&str] = &[
    "tanstackMarkdown",
    "captureInbox",
    "syncMergeStudio",
    "wikiHealthQueue",
    "mcpWriteCountdown",
];

/// Folio tag keys under `whatsNew.tags.*` for the 3.9 edition.
pub const WHATS_NEW_39_TAG_KEYS: &[&str] = &["library", "capture", "markdown"];

/// @deprecated Prefer [`WHATS_NEW_39_TAG_KEYS`].
pub const WHATS_NEW_38_TAG_KEYS: &[&str] = WHATS_NEW_39_TAG_KEYS;
/// @deprecated Prefer [`WHATS_NEW_39_TAG_KEYS`].
pub const WHATS_NEW_37_TAG_KEYS: &[&str] = WHATS_NEW_39_TAG_KEYS;
/// @deprecated Prefer [`WHATS_NEW_39_TAG_KEYS`].
pub const WHATS_NEW_36_TAG_KEYS: &[&str] = WHATS_NEW_39_TAG_KEYS;

/// @deprecated Prefer [`WHATS_NEW_39_HIGHLIGHTS`].
pub const WHATS_NEW_38_HIGHLIGHTS: &[&str] = WHATS_NEW_39_HIGHLIGHTS;
/// @deprecated Prefer [`WHATS_NEW_39_HIGHLIGHTS`].
pub const WHATS_NEW_37_HIGHLIGHTS: &[&str] = WHATS_NEW_39_HIGHLIGHTS;
/// @deprecated Prefer [`WHATS_NEW_39_HIGHLIGHTS`].
pub const WHATS_NEW_36_HIGHLIGHTS: &[&str] = WHATS_NEW_39_HIGHLIGHTS;
/// @deprecated Prefer [`WHATS_NEW_39_HIGHLIGHTS`].
pub const WHATS_NEW_35_HIGHLIGHTS: &[&str] = WHATS_NEW_39_HIGHLIGHTS;
/// @deprecated Prefer [`WHATS_NEW_39_HIGHLIGHTS`].
pub const WHATS_NEW_34_HIGHLIGHTS: &[&str] = WHATS_NEW_39_HIGHLIGHTS;

pub const EDITION_MARK_KEY: &str = "whatsNew.editionMark";

pub fn whats_new_highlights() -> Vec<String> {
    WHATS_NEW_39_HIGHLIGHTS
        .iter()
        .map(|id| (*id).to_string())
        .collect()
}

pub fn whats_new_tag_keys() -> Vec<String> {
    WHATS_NEW_39_TAG_KEYS
        .iter()
        .map(|id| (*id).to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_five_highlights() {
        assert_eq!(WHATS_NEW_39_HIGHLIGHTS.len(), 5);
        assert!(WHATS_NEW_39_HIGHLIGHTS.contains(&"tanstackMarkdown"));
        assert_eq!(whats_new_tag_keys(), vec!["library", "capture", "markdown"]);
    }
}
