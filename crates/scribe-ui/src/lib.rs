//! Scribe UI domain — version chrome, Whats New, settings nav, theme/ICS/fuzzy helpers.

mod docs_nav;
mod error;
mod export_colors;
mod flashcards;
mod fuzzy;
mod ics;
mod layout;
mod privacy;
mod reorder;
mod settings_nav;
mod skin;
mod smart_filters;
mod snippet;
mod tag_colors;
mod theme;
mod version;
mod whats_new;

pub use docs_nav::{
    docs_groups, docs_quick_links, docs_topic_ids, is_docs_topic, DocsGroup, DOCS_QUICK_LINKS,
    DOCS_TOPIC_IDS,
};
pub use error::UiError;
pub use export_colors::color_for_export;
pub use flashcards::{flashcards_to_anki_tsv, flashcards_to_markdown, FlashcardInput};
pub use fuzzy::{fuzzy_rank_strings, FuzzyRankHit, FuzzyRankItem};
pub use ics::{build_ics_calendar, IcsEventInput};
pub use layout::{
    clamp_editor_panel_width, clamp_sidebar_width, next_editor_panel_width_on_double_click,
    EDITOR_PANEL_WIDTH_DEFAULT, EDITOR_PANEL_WIDTH_MAX, EDITOR_PANEL_WIDTH_MIN,
    SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN,
};
pub use privacy::{privacy_article_ids, PRIVACY_ARTICLE_IDS, PRIVACY_EFFECTIVE_DATE};
pub use reorder::{can_nest_folder, move_id_before, FolderNestNode};
pub use settings_nav::{is_settings_section, settings_section_ids, SettingsSection};
pub use skin::{
    is_ui_skin, normalize_ui_skin, ui_skin_ids, UiSkin, UI_SKIN_STORAGE_KEY,
};
pub use smart_filters::{
    document_matches_smart_filter, smart_filter_ids, LibrarySmartFilter, SmartFilterDoc,
    SmartFilterOptions,
};
pub use snippet::sanitize_snippet;
pub use tag_colors::color_for_tag;
pub use theme::{generate_random_theme, ColorScheme, ThemeColors};
pub use version::{app_version_info, short_version, AppVersionInfo, APP_VERSION};
pub use whats_new::{whats_new_highlights, EDITION_MARK_KEY, WHATS_NEW_34_HIGHLIGHTS};

use serde::{Deserialize, Serialize};

/// Snapshot of UI metadata for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UiManifest {
    pub version: String,
    pub short_version: String,
    pub whats_new_highlights: Vec<String>,
    pub settings_section_ids: Vec<String>,
    pub privacy_article_ids: Vec<String>,
    pub privacy_effective_date: String,
    pub edition_mark_key: String,
    pub docs_topic_ids: Vec<String>,
    pub docs_quick_links: Vec<String>,
    pub docs_groups: Vec<DocsGroup>,
    pub ui_skin_ids: Vec<String>,
    pub smart_filter_ids: Vec<String>,
}

pub fn ui_manifest() -> UiManifest {
    let info = app_version_info();
    UiManifest {
        version: info.version,
        short_version: info.short_version,
        whats_new_highlights: whats_new_highlights(),
        settings_section_ids: settings_section_ids(),
        privacy_article_ids: privacy_article_ids(),
        privacy_effective_date: PRIVACY_EFFECTIVE_DATE.to_string(),
        edition_mark_key: EDITION_MARK_KEY.to_string(),
        docs_topic_ids: docs_topic_ids(),
        docs_quick_links: docs_quick_links(),
        docs_groups: docs_groups(),
        ui_skin_ids: ui_skin_ids(),
        smart_filter_ids: smart_filter_ids(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_is_coherent() {
        let m = ui_manifest();
        assert_eq!(m.version, APP_VERSION);
        assert_eq!(m.whats_new_highlights.len(), 5);
        assert!(m.settings_section_ids.contains(&"agent".to_string()));
        assert_eq!(m.docs_topic_ids.len(), 15);
        assert!(m.ui_skin_ids.contains(&"grove".to_string()));
        assert!(m.smart_filter_ids.contains(&"untagged".to_string()));
    }
}
