//! Scribe UI domain — catalogs, helpers, and optional Dioxus chrome surfaces.

mod agent_catalog;
mod code_languages;
mod diff_filters;
mod docs_nav;
mod error;
mod export_colors;
mod filenames;
mod flashcards;
mod folders;
mod fuzzy;
mod global_shortcuts;
mod graph;
mod ics;
mod journal_dates;
mod layout;
mod locale_sections;
mod lorem;
mod markdown;
mod page_setup;
mod plugin_presets;
mod privacy;
mod reorder;
mod revision_compare;
mod routes_catalog;
mod semver;
mod settings_nav;
mod shortcuts;
mod skin;
mod smart_filters;
mod snippet;
mod tag_colors;
mod tag_meta;
mod template_packs;
mod templates_catalog;
mod theme;
mod ui_fonts;
mod version;
mod whats_new;

#[cfg(feature = "dioxus")]
pub mod render;

pub use agent_catalog::{
    agent_recipe_ids, agent_recipes, agent_role_ids, is_agent_recipe_id, is_agent_role_id,
    AgentRecipeDef, AGENT_RECIPE_IDS, AGENT_ROLE_IDS,
};
pub use code_languages::{
    filter_code_languages, humanize_language_id, pinned_language_ids, resolve_code_language_alias,
    CodeLanguage, PINNED_LANGUAGE_IDS,
};
pub use diff_filters::{
    count_diff_changes, filter_diff_lines, filter_diff_lines_with_context, DiffChangeCounts,
    DiffLine, CURRENT_REVISION_ID,
};
pub use docs_nav::{
    docs_groups, docs_quick_links, docs_topic_ids, is_docs_topic, DocsGroup, DOCS_QUICK_LINKS,
    DOCS_TOPIC_IDS,
};
pub use error::UiError;
pub use export_colors::color_for_export;
pub use filenames::{sanitize_file_name, sanitize_file_stem};
pub use flashcards::{flashcards_to_anki_tsv, flashcards_to_markdown, FlashcardInput};
pub use folders::{
    collect_folder_subtree_ids, flatten_folders_for_picker, folder_path_label, FolderNode,
    FolderPickerItem,
};
pub use fuzzy::{fuzzy_rank_strings, FuzzyRankHit, FuzzyRankItem};
pub use global_shortcuts::{
    global_shortcut_ids, to_global_shortcut_accelerator, GLOBAL_SHORTCUT_IDS,
};
pub use graph::{
    analyze_graph_density, is_untitled_orphan_title, partition_orphans, suggested_layout_size,
    GraphDensity, OrphanRow,
};
pub use ics::{build_ics_calendar, IcsEventInput};
pub use journal_dates::{
    compute_journal_streak, current_week_range, format_date_key, format_date_key_today,
    format_week_key,
};
pub use layout::{
    clamp_editor_panel_width, clamp_sidebar_width, next_editor_panel_width_on_double_click,
    EDITOR_PANEL_WIDTH_DEFAULT, EDITOR_PANEL_WIDTH_MAX, EDITOR_PANEL_WIDTH_MIN,
    SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN,
};
pub use locale_sections::{locale_section_group_ids, locale_section_groups, LocaleSectionGroup};
pub use lorem::{generate_lorem_ipsum, normalize_lorem_options, LoremOptions, LoremUnit};
pub use markdown::tiptap_json_to_markdown;
pub use page_setup::{
    default_margins, paper_size_ids, paper_sizes, resolve_page_layout, PageMargins, PaperSize,
    PaperSizeId, ResolvedPageLayout,
};
pub use plugin_presets::{
    category_for_plugin_id, plugin_preset_ids, plugin_presets, PluginPreset,
};
pub use privacy::{privacy_article_ids, PRIVACY_ARTICLE_IDS, PRIVACY_EFFECTIVE_DATE};
pub use reorder::{can_nest_folder, move_id_before, FolderNestNode};
pub use revision_compare::{
    build_revision_compare_options, get_revision_timestamp, normalize_compare_pair,
    RevisionCompareOption, RevisionInput,
};
pub use routes_catalog::{document_path, route_paths, settings_path, RoutePaths};
pub use semver::{bump_semver, compare_semver, parse_semver, VersionBump};
pub use settings_nav::{is_settings_section, settings_section_ids, SettingsSection};
pub use shortcuts::{
    app_shortcut_bindings, get_resolved_hotkey, hotkey_to_display_keys, shortcut_ids,
    AppShortcutBinding,
};
pub use skin::{
    is_ui_skin, normalize_ui_skin, ui_skin_ids, UiSkin, UI_SKIN_STORAGE_KEY,
};
pub use smart_filters::{
    document_matches_smart_filter, smart_filter_ids, LibrarySmartFilter, SmartFilterDoc,
    SmartFilterOptions,
};
pub use snippet::sanitize_snippet;
pub use tag_colors::color_for_tag;
pub use tag_meta::{
    document_matches_meta_filters, make_meta_tag, parse_tag, status_tag_values, MetaFilters,
    ParsedTag, TagKind, STATUS_TAG_VALUES,
};
pub use template_packs::{
    is_template_pack, parse_template_pack, parse_template_pack_str, serialize_template_pack,
    TemplatePack, TemplatePackItem, TEMPLATE_PACK_EXTENSION, TEMPLATE_PACK_VERSION,
};
pub use templates_catalog::{
    built_in_template_categories, is_built_in_category, is_custom_category_id, is_valid_category_id,
    BUILT_IN_TEMPLATE_CATEGORIES, NEW_CATEGORY_SELECT_VALUE,
};
pub use theme::{generate_random_theme, ColorScheme, ThemeColors};
pub use ui_fonts::{
    is_ui_font_preset_id, ui_font_preset_ids, ui_font_presets, UiFontPreset, UI_FONTS_STORAGE_KEY,
};
pub use version::{app_version_info, short_version, AppVersionInfo, APP_VERSION};
pub use whats_new::{whats_new_highlights, EDITION_MARK_KEY, WHATS_NEW_34_HIGHLIGHTS};

#[cfg(feature = "dioxus")]
pub use render::{
    render_ui_surface, DocsTopicContent, PrivacyArticle, RecentDoc, StringMap, UiSurface,
    UiSurfaceRequest,
};

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
    pub shortcut_ids: Vec<String>,
    pub agent_role_ids: Vec<String>,
    pub agent_recipe_ids: Vec<String>,
    pub template_category_ids: Vec<String>,
    pub plugin_preset_ids: Vec<String>,
    pub status_tag_values: Vec<String>,
    pub paper_size_ids: Vec<String>,
    pub pinned_language_ids: Vec<String>,
    pub locale_section_group_ids: Vec<String>,
    pub global_shortcut_ids: Vec<String>,
    pub ui_font_preset_ids: Vec<String>,
    pub route_paths: RoutePaths,
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
        shortcut_ids: shortcut_ids(),
        agent_role_ids: agent_role_ids(),
        agent_recipe_ids: agent_recipe_ids(),
        template_category_ids: built_in_template_categories(),
        plugin_preset_ids: plugin_preset_ids(),
        status_tag_values: status_tag_values(),
        paper_size_ids: paper_size_ids(),
        pinned_language_ids: pinned_language_ids(),
        locale_section_group_ids: locale_section_group_ids(),
        global_shortcut_ids: global_shortcut_ids(),
        ui_font_preset_ids: ui_font_preset_ids(),
        route_paths: route_paths(),
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
        assert!(m.shortcut_ids.contains(&"commandPalette".to_string()));
        assert!(m.agent_role_ids.contains(&"general".to_string()));
        assert!(m.template_category_ids.contains(&"general".to_string()));
        assert!(m.plugin_preset_ids.contains(&"writing".to_string()));
        assert!(m.locale_section_group_ids.contains(&"core".to_string()));
        assert!(m.global_shortcut_ids.contains(&"quickNote".to_string()));
        assert!(m.ui_font_preset_ids.contains(&"default".to_string()));
        assert_eq!(m.route_paths.home, "/");
    }
}
