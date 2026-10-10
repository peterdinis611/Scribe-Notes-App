"""Snapshot of UI metadata for Python consumers (mirrors Rust ``ui_manifest``)."""

from __future__ import annotations

from typing import Any, TypedDict

from .agent_catalog import agent_recipe_ids, agent_role_ids
from .docs_nav import docs_groups, docs_quick_links, docs_topic_ids
from .heading_levels import heading_levels
from .paragraph_styles import paragraph_style_ids
from .privacy import PRIVACY_EFFECTIVE_DATE, privacy_article_ids
from .routes import route_paths
from .settings_nav import settings_section_ids
from .skin import ui_skin_ids
from .smart_filters import smart_filter_ids
from .tag_meta import status_tag_values
from .theme_presets import theme_preset_ids
from .version import app_version_info
from .whats_new import EDITION_MARK_KEY, whats_new_highlights


class UiManifest(TypedDict):
    version: str
    shortVersion: str
    whatsNewHighlights: list[str]
    settingsSectionIds: list[str]
    privacyArticleIds: list[str]
    privacyEffectiveDate: str
    editionMarkKey: str
    docsTopicIds: list[str]
    docsQuickLinks: list[str]
    docsGroups: list[dict[str, Any]]
    uiSkinIds: list[str]
    smartFilterIds: list[str]
    agentRoleIds: list[str]
    agentRecipeIds: list[str]
    statusTagValues: list[str]
    themePresetIds: list[str]
    routePaths: dict[str, str]
    paragraphStyleIds: list[str]
    headingLevels: list[int]


def ui_manifest() -> UiManifest:
    info = app_version_info()
    return {
        "version": info["version"],
        "shortVersion": info["shortVersion"],
        "whatsNewHighlights": whats_new_highlights(),
        "settingsSectionIds": settings_section_ids(),
        "privacyArticleIds": privacy_article_ids(),
        "privacyEffectiveDate": PRIVACY_EFFECTIVE_DATE,
        "editionMarkKey": EDITION_MARK_KEY,
        "docsTopicIds": docs_topic_ids(),
        "docsQuickLinks": docs_quick_links(),
        "docsGroups": docs_groups(),  # type: ignore[typeddict-item]
        "uiSkinIds": ui_skin_ids(),
        "smartFilterIds": smart_filter_ids(),
        "agentRoleIds": agent_role_ids(),
        "agentRecipeIds": agent_recipe_ids(),
        "statusTagValues": status_tag_values(),
        "themePresetIds": theme_preset_ids(),
        "routePaths": dict(route_paths()),
        "paragraphStyleIds": paragraph_style_ids(),
        "headingLevels": heading_levels(),
    }
