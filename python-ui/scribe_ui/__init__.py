"""Scribe UI domain — catalogs and helpers (Python twin of crates/scribe-ui)."""

from .agent_catalog import (
    AGENT_RECIPE_IDS,
    AGENT_ROLE_IDS,
    agent_recipe_ids,
    agent_recipes,
    agent_role_ids,
    is_agent_recipe_id,
    is_agent_role_id,
)
from .docs_nav import (
    DOCS_QUICK_LINKS,
    DOCS_TOPIC_IDS,
    docs_groups,
    docs_quick_links,
    docs_topic_ids,
    is_docs_topic,
)
from .filenames import sanitize_file_name, sanitize_file_stem
from .fuzzy import FuzzyRankHit, FuzzyRankItem, fuzzy_rank_strings
from .heading_levels import HEADING_LEVELS, heading_label, heading_levels, is_heading_level
from .manifest import UiManifest, ui_manifest
from .paragraph_styles import (
    PARAGRAPH_STYLE_IDS,
    is_paragraph_style_id,
    paragraph_style_ids,
    paragraph_styles,
    resolve_paragraph_style,
)
from .privacy import PRIVACY_ARTICLE_IDS, PRIVACY_EFFECTIVE_DATE, privacy_article_ids
from .routes import document_path, route_paths, settings_path
from .settings_nav import is_settings_section, settings_section_ids
from .skin import UI_SKIN_STORAGE_KEY, is_ui_skin, normalize_ui_skin, ui_skin_ids
from .smart_filters import (
    document_matches_smart_filter,
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
from .theme_presets import (
    CYCLE_THEME_ORDER,
    THEME_ID_CUSTOM,
    THEME_ID_SYSTEM,
    is_theme_id,
    next_cycle_theme,
    theme_preset_ids,
)
from .version import APP_VERSION, app_version_info, short_version
from .whats_new import EDITION_MARK_KEY, WHATS_NEW_34_HIGHLIGHTS, whats_new_highlights

__version__ = APP_VERSION

__all__ = [
    "AGENT_RECIPE_IDS",
    "AGENT_ROLE_IDS",
    "APP_VERSION",
    "CYCLE_THEME_ORDER",
    "DOCS_QUICK_LINKS",
    "DOCS_TOPIC_IDS",
    "EDITION_MARK_KEY",
    "HEADING_LEVELS",
    "PARAGRAPH_STYLE_IDS",
    "PRIVACY_ARTICLE_IDS",
    "PRIVACY_EFFECTIVE_DATE",
    "STATUS_TAG_VALUES",
    "THEME_ID_CUSTOM",
    "THEME_ID_SYSTEM",
    "UI_SKIN_STORAGE_KEY",
    "WHATS_NEW_34_HIGHLIGHTS",
    "FuzzyRankHit",
    "FuzzyRankItem",
    "UiManifest",
    "agent_recipe_ids",
    "agent_recipes",
    "agent_role_ids",
    "app_version_info",
    "docs_groups",
    "docs_quick_links",
    "docs_topic_ids",
    "document_matches_meta_filters",
    "document_matches_smart_filter",
    "document_path",
    "fuzzy_rank_strings",
    "heading_label",
    "heading_levels",
    "is_agent_recipe_id",
    "is_agent_role_id",
    "is_docs_topic",
    "is_heading_level",
    "is_paragraph_style_id",
    "is_settings_section",
    "is_smart_filter_id",
    "is_theme_id",
    "is_ui_skin",
    "make_meta_tag",
    "next_cycle_theme",
    "normalize_ui_skin",
    "paragraph_style_ids",
    "paragraph_styles",
    "parse_tag",
    "privacy_article_ids",
    "resolve_paragraph_style",
    "route_paths",
    "sanitize_file_name",
    "sanitize_file_stem",
    "sanitize_snippet",
    "settings_path",
    "settings_section_ids",
    "short_version",
    "smart_filter_ids",
    "status_tag_values",
    "theme_preset_ids",
    "ui_manifest",
    "ui_skin_ids",
    "whats_new_highlights",
]
