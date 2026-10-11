//! Whats New edition highlights (i18n keys live in FE locales).

/// Edition 3.5 highlight ids — must match `whatsNew.*` keys in en/sk.json.
pub const WHATS_NEW_35_HIGHLIGHTS: &[&str] = &[
    "docsFieldGuide",
    "pythonUiChrome",
    "sharedUiCatalogs",
    "renderUiSurface",
    "welcomeSurfaces",
];

/// @deprecated Prefer [`WHATS_NEW_35_HIGHLIGHTS`].
pub const WHATS_NEW_34_HIGHLIGHTS: &[&str] = WHATS_NEW_35_HIGHLIGHTS;

pub const EDITION_MARK_KEY: &str = "whatsNew.editionMark";

pub fn whats_new_highlights() -> Vec<String> {
    WHATS_NEW_35_HIGHLIGHTS
        .iter()
        .map(|id| (*id).to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_five_highlights() {
        assert_eq!(WHATS_NEW_35_HIGHLIGHTS.len(), 5);
        assert!(WHATS_NEW_35_HIGHLIGHTS.contains(&"docsFieldGuide"));
    }
}
