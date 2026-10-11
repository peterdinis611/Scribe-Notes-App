"""Snapshot of UI metadata for Python consumers (mirrors Rust ``ui_manifest``)."""

from __future__ import annotations

from typing import Any, TypedDict

from .agent_catalog import agent_recipe_ids, agent_role_ids
from .code_languages import pinned_language_ids
from .docs_nav import docs_groups, docs_quick_links, docs_topic_ids, docs_topic_tips
from .document_style_presets import document_style_preset_ids
from .global_shortcuts import global_shortcut_ids
from .heading_levels import heading_levels
from .library_views import library_view_ids
from .locale_options import built_in_locales
from .locale_sections import locale_section_group_ids
from .page_setup import paper_size_ids
from .paragraph_styles import paragraph_style_ids
from .plugin_presets import plugin_preset_ids
from .privacy import PRIVACY_EFFECTIVE_DATE, privacy_article_ids
from .routes import route_paths
from .settings_nav import settings_section_ids
from .shortcuts import shortcut_ids
from .skin import ui_skin_ids
from .smart_filters import smart_filter_ids
from .tag_meta import status_tag_values
from .templates_catalog import built_in_template_categories
from .theme_presets import theme_preset_ids
from .ui_fonts import ui_font_preset_ids
from .version import app_version_info
from .whats_new import EDITION_MARK_KEY, whats_new_highlights, whats_new_tag_keys


class UiManifest(TypedDict):
    version: str
    shortVersion: str
    whatsNewHighlights: list[str]
    whatsNewTagKeys: list[str]
    settingsSectionIds: list[str]
    privacyArticleIds: list[str]
    privacyEffectiveDate: str
    editionMarkKey: str
    docsTopicIds: list[str]
    docsQuickLinks: list[str]
    docsGroups: list[dict[str, Any]]
    docsTopicTips: list[dict[str, Any]]
    uiSkinIds: list[str]
    smartFilterIds: list[str]
    libraryViewIds: list[str]
    shortcutIds: list[str]
    agentRoleIds: list[str]
    agentRecipeIds: list[str]
    templateCategoryIds: list[str]
    pluginPresetIds: list[str]
    statusTagValues: list[str]
    paperSizeIds: list[str]
    pinnedLanguageIds: list[str]
    localeSectionGroupIds: list[str]
    globalShortcutIds: list[str]
    uiFontPresetIds: list[str]
    routePaths: dict[str, str]
    documentStylePresetIds: list[str]
    themePresetIds: list[str]
    builtInLocales: list[str]
    paragraphStyleIds: list[str]
    headingLevels: list[int]


def ui_manifest() -> UiManifest:
    info = app_version_info()
    return {
        "version": info["version"],
        "shortVersion": info["shortVersion"],
        "whatsNewHighlights": whats_new_highlights(),
        "whatsNewTagKeys": whats_new_tag_keys(),
        "settingsSectionIds": settings_section_ids(),
        "privacyArticleIds": privacy_article_ids(),
        "privacyEffectiveDate": PRIVACY_EFFECTIVE_DATE,
        "editionMarkKey": EDITION_MARK_KEY,
        "docsTopicIds": docs_topic_ids(),
        "docsQuickLinks": docs_quick_links(),
        "docsGroups": docs_groups(),  # type: ignore[typeddict-item]
        "docsTopicTips": docs_topic_tips(),  # type: ignore[typeddict-item]
        "uiSkinIds": ui_skin_ids(),
        "smartFilterIds": smart_filter_ids(),
        "libraryViewIds": library_view_ids(),
        "shortcutIds": shortcut_ids(),
        "agentRoleIds": agent_role_ids(),
        "agentRecipeIds": agent_recipe_ids(),
        "templateCategoryIds": built_in_template_categories(),
        "pluginPresetIds": plugin_preset_ids(),
        "statusTagValues": status_tag_values(),
        "paperSizeIds": paper_size_ids(),
        "pinnedLanguageIds": pinned_language_ids(),
        "localeSectionGroupIds": locale_section_group_ids(),
        "globalShortcutIds": global_shortcut_ids(),
        "uiFontPresetIds": ui_font_preset_ids(),
        "routePaths": dict(route_paths()),
        "documentStylePresetIds": document_style_preset_ids(),
        "themePresetIds": theme_preset_ids(),
        "builtInLocales": built_in_locales(),
        "paragraphStyleIds": paragraph_style_ids(),
        "headingLevels": heading_levels(),
    }
