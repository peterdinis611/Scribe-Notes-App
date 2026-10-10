//! Scribe UI domain — catalogs, helpers, and optional Dioxus chrome surfaces.

mod agent_catalog;
mod canvas_doc;
mod canvas_flow;
mod code_languages;
mod custom_locales;
mod custom_templates;
mod diff_filters;
mod doc_stats;
mod docs_nav;
mod document_ask;
mod document_style_presets;
mod document_styles;
mod editor_catalogs;
mod error;
mod export_colors;
mod filenames;
mod flashcards;
mod folders;
mod fuzzy;
mod global_shortcuts;
mod graph;
mod heading_levels;
mod html_content;
mod ics;
mod import_path;
mod journal_dates;
mod layout;
mod layout_panels;
mod library_tree;
mod locale_options;
mod locale_sections;
mod lorem;
mod lru_cache;
mod map_spec;
mod markdown;
mod markdown_outline;
mod markdown_promote;
mod marketplace_catalog;
mod merge_duplicates;
mod orphan_links;
mod page_header_footer;
mod page_setup;
mod palette_headings;
mod paragraph_styles;
mod pdf_highlights;
mod plugin_presets;
mod privacy;
mod reorder;
mod resolve_color;
mod revision_compare;
mod routes_catalog;
mod semver;
mod settings_nav;
mod shortcuts;
mod skin;
mod smart_filters;
mod snippet;
mod snippet_validation;
mod tag_colors;
mod tag_meta;
mod template_categories;
mod template_packs;
mod templates_catalog;
mod theme;
mod theme_apply;
mod theme_presets;
mod tour_selectors;
mod ui_fonts;
mod version;
mod video_embed;
mod whats_new;

#[cfg(feature = "dioxus")]
pub mod components;
#[cfg(feature = "dioxus")]
pub mod render;

pub use agent_catalog::{
    agent_recipe_ids, agent_recipes, agent_role_ids, is_agent_recipe_id, is_agent_role_id,
    AgentRecipeDef, AGENT_RECIPE_IDS, AGENT_ROLE_IDS,
};
pub use canvas_doc::{
    empty_canvas_document, is_canvas_content, parse_canvas_document, serialize_canvas_document,
    CanvasCard, CanvasDocument, CanvasEdge, CANVAS_CONTENT_TYPE, CANVAS_VERSION,
};
pub use canvas_flow::{
    canvas_edges_to_flow, cards_to_nodes, create_note_node, create_note_node_with_id,
    flow_to_canvas_document, CanvasNoteData, CanvasNoteNode, FlowEdge, FlowMeasured, FlowNode,
    FlowPosition, FlowSize, CANVAS_EDGE_TYPE, CANVAS_NOTE_TYPE,
};
pub use code_languages::{
    filter_code_languages, humanize_language_id, pinned_language_ids, resolve_code_language_alias,
    CodeLanguage, PINNED_LANGUAGE_IDS,
};
pub use custom_locales::{
    count_leaves, guess_code_from_file_name, is_built_in_locale_code, is_valid_locale_code,
    normalize_locale_code, parse_custom_locale_pack, serialize_custom_locale_pack, CustomLocaleError,
    CustomLocalePack, ParseLocaleOptions, MAX_LOCALE_CODE_LEN, MAX_LOCALE_JSON_CHARS,
    MAX_LOCALE_NAME_LEN, MIN_TRANSLATION_LEAVES,
};
pub use custom_templates::{
    create_custom_template, is_custom_template, merge_templates, parse_stored_custom_templates,
    CustomDocumentTemplate, CustomTemplateInput, CUSTOM_TEMPLATE_ID_PREFIX,
    DEFAULT_TEMPLATE_CATEGORY,
};
pub use diff_filters::{
    count_diff_changes, filter_diff_lines, filter_diff_lines_with_context,
    filter_side_by_side_rows, filter_side_by_side_with_context, normalize_side_by_side_rows,
    DiffChangeCounts, DiffLine, SideBySideCell, SideBySideRow, CURRENT_REVISION_ID,
};
pub use document_ask::{
    build_document_ask_actions, build_document_ask_questions, AskAnalysisInput, AskDate,
    AskKeyword, AskOutlineItem, AskTaskInput, DocumentAskOptions,
};
pub use doc_stats::{
    count_characters, count_words, extract_title_from_content,
    extract_title_from_content_with_fallback,
};
pub use docs_nav::{
    docs_groups, docs_quick_links, docs_topic_ids, is_docs_topic, DocsGroup, DOCS_QUICK_LINKS,
    DOCS_TOPIC_IDS,
};
pub use document_style_presets::{
    apply_document_style_preset, default_document_typography, default_page_setup,
    document_style_preset_ids, document_style_presets, get_document_style_preset,
    DocumentStylePreset, PageHeaderFooter, PageSetup,
};
pub use document_styles::{
    build_document_content_css, build_watermark_css, document_content_css,
    resolve_document_typography, DocumentTypography, DocumentTypographyInput, DOCUMENT_BODY_FONT,
    DOCUMENT_HIGHLIGHT_CSS, DOCUMENT_TIPTAP_CSS, PDF_CAPTURE_CSS,
};
pub use editor_catalogs::{
    font_family_label, format_custom_font_family, is_preset_font_family, normalize_font_family,
    parse_recent_fonts, push_recent_font, FONT_FAMILIES, FONT_SIZES, HIGHLIGHT_COLORS, LINE_HEIGHTS,
    MAX_RECENT_FONTS, PARAGRAPH_SPACING, RECENT_FONTS_KEY, TEXT_COLORS,
};
pub use error::UiError;
pub use export_colors::color_for_export;
pub use filenames::{sanitize_file_name, sanitize_file_stem};
pub use flashcards::{flashcards_to_anki_tsv, flashcards_to_markdown, FlashcardInput};
pub use folders::{
    collect_folder_subtree_ids, flatten_folders_for_picker, folder_path_label,
    suggest_folder_from_tags, FolderNode, FolderPickerItem,
};
pub use fuzzy::{fuzzy_rank_strings, FuzzyRankHit, FuzzyRankItem};
pub use global_shortcuts::{
    global_shortcut_ids, to_global_shortcut_accelerator, GLOBAL_SHORTCUT_IDS,
};
pub use graph::{
    analyze_graph_density, is_untitled_orphan_title, partition_orphans, suggested_layout_size,
    GraphDensity, OrphanRow,
};
pub use heading_levels::{
    heading_label, heading_levels, is_heading_level, HeadingLevel, HEADING_LEVELS,
};
pub use html_content::{
    empty_doc_json, normalize_doc_json, plain_text_to_content_json, title_from_html,
};
pub use ics::{build_ics_calendar, IcsEventInput};
pub use import_path::{import_title_from_path, is_pages_path};
pub use journal_dates::{
    compute_journal_streak, current_week_range, format_date_key, format_date_key_today,
    format_week_key,
};
pub use layout::{
    clamp_editor_panel_width, clamp_sidebar_width, next_editor_panel_width_on_double_click,
    EDITOR_PANEL_WIDTH_DEFAULT, EDITOR_PANEL_WIDTH_MAX, EDITOR_PANEL_WIDTH_MIN,
    SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN,
};
pub use layout_panels::{
    clamp_toc_rail_width, editor_side_room, occupied_library_width, read_editor_panel_width,
    read_sidebar_width, read_toc_rail_width, resolve_panel_widths, resolve_panel_widths_default,
    width_css_var, PanelWidths, DEFAULT_VIEWPORT_WIDTH, EDITOR_PANEL_WIDTH_CSS_VAR,
    EDITOR_PANEL_WIDTH_KEY, SIDEBAR_WIDTH_CSS_VAR, SIDEBAR_WIDTH_KEY, TOC_RAIL_WIDTH_CSS_VAR,
    TOC_RAIL_WIDTH_DEFAULT, TOC_RAIL_WIDTH_KEY, TOC_RAIL_WIDTH_MAX, TOC_RAIL_WIDTH_MIN,
};
pub use library_tree::{
    build_tree, estimate_flat_item_size, flatten_library, flatten_tree, FlatTreeItem,
    LibraryDocument, LibraryFolder, TreeNode, DOCUMENT_ROW_HEIGHT, FOLDER_ROW_HEIGHT,
};
pub use locale_options::{build_locale_options, CustomLocaleInput, LocaleOption, BUILT_IN_LOCALES, DEFAULT_LOCALE};
pub use locale_sections::{locale_section_group_ids, locale_section_groups, LocaleSectionGroup};
pub use lorem::{generate_lorem_ipsum, normalize_lorem_options, LoremOptions, LoremUnit};
pub use lru_cache::{LruCache, LruCacheOptions, LruCacheStats, LruEvictReason};
pub use map_spec::{
    is_map_url, map_embed_href, map_osm_href, map_preview_label, parse_map_spec, spec_from_map_url,
    MapSpec, MAP_DEFAULT_SOURCE,
};
pub use markdown::tiptap_json_to_markdown;
pub use markdown_outline::collect_markdown_heading_outline;
pub use markdown_promote::promote_markdown_special_blocks;
pub use marketplace_catalog::{
    check_plugin_updates, list_marketplace_by_kind, list_marketplace_listings, MarketplaceListing,
    MarketplaceStatus, PluginUpdate, MARKETPLACE_STATUS,
};
pub use merge_duplicates::{merge_duplicate_content, merge_duplicate_content_value};
pub use orphan_links::{suggest_orphan_links, OrphanLinkSuggestion, OrphanSuggestionRow};
pub use page_header_footer::{
    build_header_footer_lines, format_export_date, format_export_date_today,
    format_pagination_summary, pagination_summary_template, resolve_header_footer_template,
    HeaderFooterContext, HeaderFooterLines, PAGINATION_SUMMARY_EN, PAGINATION_SUMMARY_SK,
};
pub use page_header_footer::px_to_pt as header_footer_px_to_pt;
pub use page_setup::{
    default_margins, paper_size_ids, paper_sizes, resolve_page_layout, PageMargins, PaperSize,
    PaperSizeId, ResolvedPageLayout,
};
pub use paragraph_styles::{
    is_paragraph_style_id, paragraph_style_ids, paragraph_styles, resolve_paragraph_style,
    ParagraphStyleAttrs, ParagraphStyleDef, ParagraphStyleId, PARAGRAPH_STYLE_IDS,
};
pub use pdf_highlights::{
    extract_text_from_quad_points, highlight_from_annotation, is_highlight_subtype,
    map_to_tiptap_highlight, parse_rgb_triplet, pdf_highlights_to_content_json, rgba_to_css,
    PdfHighlightAnnotation, PdfHighlightsImport, PdfTextItem, DEFAULT_HIGHLIGHT_HEX,
    HIGHLIGHT_SUBTYPES,
};
pub use palette_headings::collect_headings_from_json;
pub use plugin_presets::{
    category_for_plugin_id, plugin_preset_ids, plugin_presets, PluginPreset,
};
pub use privacy::{privacy_article_ids, PRIVACY_ARTICLE_IDS, PRIVACY_EFFECTIVE_DATE};
pub use reorder::{can_nest_folder, move_id_before, FolderNestNode};
pub use resolve_color::{is_theme_color_key, resolve_color, ColorTokens};
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
pub use snippet_validation::{
    allowed_snippet_node_types, is_valid_snippet_id, sanitize_json_content,
    sanitize_json_content_list, validate_snippet_input, ParsedSnippetInput, SNIPPET_LIMITS,
    ValidateSnippetInput,
};
pub use tag_colors::color_for_tag;
pub use tag_meta::{
    document_matches_meta_filters, make_meta_tag, parse_tag, status_tag_values, MetaFilters,
    ParsedTag, TagKind, STATUS_TAG_VALUES,
};
pub use template_categories::{
    built_in_category_label, category_label, create_custom_category,
    parse_stored_custom_categories, CustomTemplateCategory,
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
pub use theme_apply::{
    cycle_theme_id, is_dark_color, plan_theme_application, resolve_theme_colors, resolve_theme_id,
    CssVar, ResolvedTheme, ThemeApplication,
};
pub use theme_presets::{
    default_custom_theme, get_preset_by_id, is_theme_id, next_cycle_theme, theme_preset_ids,
    theme_presets, ThemeColorField, ThemeColorScheme, ThemePreset, ThemeSettings, CYCLE_THEME_ORDER,
    THEME_COLOR_FIELDS, THEME_ID_CUSTOM, THEME_ID_SYSTEM,
};
pub use tour_selectors::{is_tour_id, tour_selector, tour_target_ids, TOUR_TARGETS};
pub use ui_fonts::{
    is_ui_font_preset_id, ui_font_preset_ids, ui_font_presets, UiFontPreset, UI_FONTS_STORAGE_KEY,
};
pub use version::{app_version_info, short_version, AppVersionInfo, APP_VERSION};
pub use video_embed::{
    extract_vimeo_id, extract_youtube_id, is_video_url, video_export_embed, video_provider_label,
    VideoExportEmbed,
};
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
    pub document_style_preset_ids: Vec<String>,
    pub theme_preset_ids: Vec<String>,
    pub built_in_locales: Vec<String>,
    pub paragraph_style_ids: Vec<String>,
    pub heading_levels: Vec<u8>,
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
        document_style_preset_ids: document_style_preset_ids(),
        theme_preset_ids: theme_preset_ids(),
        built_in_locales: BUILT_IN_LOCALES.iter().map(|s| (*s).to_string()).collect(),
        paragraph_style_ids: paragraph_style_ids(),
        heading_levels: heading_levels(),
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
        assert!(m.document_style_preset_ids.contains(&"academic".to_string()));
        assert!(!m.theme_preset_ids.is_empty());
        assert!(m.built_in_locales.contains(&"sk".to_string()));
        assert!(m.paragraph_style_ids.contains(&"title".to_string()));
        assert_eq!(m.heading_levels, vec![1, 2, 3, 4, 5, 6]);
    }
}
