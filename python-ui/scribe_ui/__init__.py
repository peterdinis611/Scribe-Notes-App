"""Scribe UI domain — catalogs, helpers, and HTML chrome builders."""

from . import html
from .agent_catalog import (
    AGENT_RECIPE_IDS,
    AGENT_ROLE_IDS,
    agent_recipe_ids,
    agent_recipes,
    agent_role_ids,
    is_agent_recipe_id,
    is_agent_role_id,
)
from .code_languages import PINNED_LANGUAGE_IDS, pinned_language_ids
from .docs_nav import (
    DOCS_QUICK_LINKS,
    DOCS_TOPIC_IDS,
    docs_groups,
    docs_quick_links,
    docs_topic_ids,
    docs_topic_tips,
    is_docs_topic,
)
from .document_style_presets import DOCUMENT_STYLE_PRESET_IDS, document_style_preset_ids
from .filenames import sanitize_file_name, sanitize_file_stem
from .fuzzy import FuzzyRankHit, FuzzyRankItem, fuzzy_rank_strings
from .library_assets import (
    LIBRARY_ASSET_KIND_FILTERS,
    asset_kind,
    filter_library_assets,
    format_bytes,
    is_orphan_asset,
    is_previewable_kind,
    is_video_kind,
    library_asset_kind_filters,
)
from .orphan_links import suggest_orphan_links
from .resolve_color import THEME_COLOR_KEYS, is_theme_color_key, resolve_color
from .global_shortcuts import GLOBAL_SHORTCUT_IDS, global_shortcut_ids, to_global_shortcut_accelerator
from .heading_levels import HEADING_LEVELS, heading_label, heading_levels, is_heading_level
from .library_views import LIBRARY_VIEW_IDS, is_library_view_id, library_view_ids
from .locale_options import BUILT_IN_LOCALES, DEFAULT_LOCALE, built_in_locales
from .locale_sections import locale_section_group_ids, locale_section_groups
from .manifest import UiManifest, ui_manifest
from .markdown_outline import collect_markdown_heading_outline
from .page_setup import paper_size_ids, paper_sizes
from .paragraph_styles import (
    PARAGRAPH_STYLE_IDS,
    is_paragraph_style_id,
    paragraph_style_ids,
    paragraph_styles,
    resolve_paragraph_style,
)
from .plugin_presets import plugin_preset_ids, plugin_presets
from .privacy import PRIVACY_ARTICLE_IDS, PRIVACY_EFFECTIVE_DATE, privacy_article_ids
from .routes import document_path, route_paths, settings_path
from .settings_nav import is_settings_section, settings_section_ids
from .shortcuts import app_shortcut_bindings, shortcut_ids
from .skin import UI_SKIN_STORAGE_KEY, is_ui_skin, normalize_ui_skin, ui_skin_ids
from .smart_filters import (
    document_matches_smart_filter,
    filter_documents,
    is_smart_filter_id,
    smart_filter_ids,
)
from .snippet import sanitize_snippet
from .tag_meta import (
    STATUS_TAG_VALUES,
    document_matches_meta_filters,
    make_meta_tag,
    parse_tag,
    status_tag_values,
)
from .templates_catalog import (
    BUILT_IN_TEMPLATE_CATEGORIES,
    built_in_template_categories,
    is_valid_category_id,
)
from .theme_presets import (
    CYCLE_THEME_ORDER,
    THEME_ID_CUSTOM,
    THEME_ID_SYSTEM,
    is_theme_id,
    next_cycle_theme,
    theme_preset_ids,
)
from .tour_selectors import (
    TOUR_TARGETS,
    is_tour_id,
    tour_selector,
    tour_selector_for_id,
    tour_target_ids,
)
from .ui_fonts import UI_FONT_PRESET_IDS, UI_FONTS_STORAGE_KEY, is_ui_font_preset_id, ui_font_preset_ids
from .version import APP_VERSION, app_version_info, short_version
from .whats_new import (
    EDITION_MARK_KEY,
    WHATS_NEW_40_HIGHLIGHTS,
    WHATS_NEW_40_TAG_KEYS,
    whats_new_highlights,
    whats_new_tag_keys,
)

__version__ = APP_VERSION

__all__ = [
    "html",
    "AGENT_RECIPE_IDS",
    "AGENT_ROLE_IDS",
    "APP_VERSION",
    "BUILT_IN_LOCALES",
    "BUILT_IN_TEMPLATE_CATEGORIES",
    "CYCLE_THEME_ORDER",
    "DEFAULT_LOCALE",
    "DOCS_QUICK_LINKS",
    "DOCS_TOPIC_IDS",
    "DOCUMENT_STYLE_PRESET_IDS",
    "EDITION_MARK_KEY",
    "GLOBAL_SHORTCUT_IDS",
    "HEADING_LEVELS",
    "LIBRARY_ASSET_KIND_FILTERS",
    "LIBRARY_VIEW_IDS",
    "PARAGRAPH_STYLE_IDS",
    "THEME_COLOR_KEYS",
    "PINNED_LANGUAGE_IDS",
    "PRIVACY_ARTICLE_IDS",
    "PRIVACY_EFFECTIVE_DATE",
    "STATUS_TAG_VALUES",
    "THEME_ID_CUSTOM",
    "THEME_ID_SYSTEM",
    "TOUR_TARGETS",
    "UI_FONT_PRESET_IDS",
    "UI_FONTS_STORAGE_KEY",
    "UI_SKIN_STORAGE_KEY",
    "WHATS_NEW_40_HIGHLIGHTS",
    "WHATS_NEW_40_TAG_KEYS",
    "FuzzyRankHit",
    "FuzzyRankItem",
    "UiManifest",
    "agent_recipe_ids",
    "agent_recipes",
    "agent_role_ids",
    "app_shortcut_bindings",
    "app_version_info",
    "asset_kind",
    "built_in_locales",
    "built_in_template_categories",
    "collect_markdown_heading_outline",
    "docs_groups",
    "docs_quick_links",
    "docs_topic_ids",
    "docs_topic_tips",
    "document_matches_meta_filters",
    "document_matches_smart_filter",
    "document_path",
    "document_style_preset_ids",
    "filter_documents",
    "filter_library_assets",
    "format_bytes",
    "fuzzy_rank_strings",
    "global_shortcut_ids",
    "heading_label",
    "heading_levels",
    "is_agent_recipe_id",
    "is_agent_role_id",
    "is_docs_topic",
    "is_heading_level",
    "is_library_view_id",
    "is_orphan_asset",
    "is_paragraph_style_id",
    "is_previewable_kind",
    "is_settings_section",
    "is_smart_filter_id",
    "is_theme_color_key",
    "is_theme_id",
    "is_tour_id",
    "is_ui_font_preset_id",
    "is_ui_skin",
    "is_valid_category_id",
    "is_video_kind",
    "library_asset_kind_filters",
    "library_view_ids",
    "locale_section_group_ids",
    "locale_section_groups",
    "make_meta_tag",
    "next_cycle_theme",
    "normalize_ui_skin",
    "paper_size_ids",
    "paper_sizes",
    "paragraph_style_ids",
    "paragraph_styles",
    "parse_tag",
    "pinned_language_ids",
    "plugin_preset_ids",
    "plugin_presets",
    "privacy_article_ids",
    "resolve_color",
    "resolve_paragraph_style",
    "route_paths",
    "sanitize_file_name",
    "sanitize_file_stem",
    "sanitize_snippet",
    "settings_path",
    "settings_section_ids",
    "short_version",
    "shortcut_ids",
    "smart_filter_ids",
    "status_tag_values",
    "suggest_orphan_links",
    "theme_preset_ids",
    "to_global_shortcut_accelerator",
    "tour_selector",
    "tour_selector_for_id",
    "tour_target_ids",
    "ui_font_preset_ids",
    "ui_manifest",
    "ui_skin_ids",
    "whats_new_highlights",
    "whats_new_tag_keys",
]
