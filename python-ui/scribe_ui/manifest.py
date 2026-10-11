"""Snapshot of UI metadata for Python consumers (mirrors Rust ``ui_manifest``).

``ui_manifest()`` returns exactly the same keys as before. Everything else
(registry, validation, hashing, diffing, JSON) is additive.
"""

from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass
from typing import Any, Callable, Iterable, Literal, Mapping, TypedDict

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


# --------------------------------------------------------------------------- #
# Section registry: one line per manifest key (order = output order)
# --------------------------------------------------------------------------- #

SectionKind = Literal["str", "strs", "ids", "ints", "records", "mapping"]


class ManifestError(RuntimeError):
    """A manifest section provider failed; the message names the section."""


@dataclass(frozen=True)
class ManifestSection:
    key: str
    provider: Callable[[], Any]
    kind: SectionKind


SECTIONS: tuple[ManifestSection, ...] = (
    ManifestSection("version", lambda: app_version_info()["version"], "str"),
    ManifestSection("shortVersion", lambda: app_version_info()["shortVersion"], "str"),
    ManifestSection("whatsNewHighlights", whats_new_highlights, "strs"),
    ManifestSection("whatsNewTagKeys", whats_new_tag_keys, "ids"),
    ManifestSection("settingsSectionIds", settings_section_ids, "ids"),
    ManifestSection("privacyArticleIds", privacy_article_ids, "ids"),
    ManifestSection("privacyEffectiveDate", lambda: PRIVACY_EFFECTIVE_DATE, "str"),
    ManifestSection("editionMarkKey", lambda: EDITION_MARK_KEY, "str"),
    ManifestSection("docsTopicIds", docs_topic_ids, "ids"),
    ManifestSection("docsQuickLinks", docs_quick_links, "strs"),
    ManifestSection("docsGroups", docs_groups, "records"),
    ManifestSection("docsTopicTips", docs_topic_tips, "records"),
    ManifestSection("uiSkinIds", ui_skin_ids, "ids"),
    ManifestSection("smartFilterIds", smart_filter_ids, "ids"),
    ManifestSection("libraryViewIds", library_view_ids, "ids"),
    ManifestSection("shortcutIds", shortcut_ids, "ids"),
    ManifestSection("agentRoleIds", agent_role_ids, "ids"),
    ManifestSection("agentRecipeIds", agent_recipe_ids, "ids"),
    ManifestSection("templateCategoryIds", built_in_template_categories, "ids"),
    ManifestSection("pluginPresetIds", plugin_preset_ids, "ids"),
    ManifestSection("statusTagValues", status_tag_values, "ids"),
    ManifestSection("paperSizeIds", paper_size_ids, "ids"),
    ManifestSection("pinnedLanguageIds", pinned_language_ids, "ids"),
    ManifestSection("localeSectionGroupIds", locale_section_group_ids, "ids"),
    ManifestSection("globalShortcutIds", global_shortcut_ids, "ids"),
    ManifestSection("uiFontPresetIds", ui_font_preset_ids, "ids"),
    ManifestSection("routePaths", lambda: dict(route_paths()), "mapping"),
    ManifestSection("documentStylePresetIds", document_style_preset_ids, "ids"),
    ManifestSection("themePresetIds", theme_preset_ids, "ids"),
    ManifestSection("builtInLocales", built_in_locales, "ids"),
    ManifestSection("paragraphStyleIds", paragraph_style_ids, "ids"),
    ManifestSection("headingLevels", heading_levels, "ints"),
)

_BY_KEY: dict[str, ManifestSection] = {s.key: s for s in SECTIONS}

# Guard: the registry and the TypedDict must never drift apart.
assert len(_BY_KEY) == len(SECTIONS), "duplicate manifest keys in SECTIONS"
assert set(_BY_KEY) == set(UiManifest.__annotations__), (
    "SECTIONS and UiManifest differ: "
    f"{set(_BY_KEY) ^ set(UiManifest.__annotations__)}"
)


# --------------------------------------------------------------------------- #
# Building
# --------------------------------------------------------------------------- #

def _build_section(section: ManifestSection) -> Any:
    try:
        value = section.provider()
    except Exception as exc:  # noqa: BLE001
        raise ManifestError(f"manifest section {section.key!r} failed: {exc}") from exc
    # Deep copy so callers can't mutate shared module state.
    return copy.deepcopy(value)


def ui_manifest_keys() -> list[str]:
    return [s.key for s in SECTIONS]


def ui_manifest_section(key: str) -> Any:
    """Build a single section, e.g. ``ui_manifest_section("themePresetIds")``."""
    try:
        return _build_section(_BY_KEY[key])
    except KeyError:
        raise KeyError(f"unknown manifest key: {key!r}") from None


def ui_manifest_subset(keys: Iterable[str]) -> dict[str, Any]:
    """Build only some sections (cheaper than the full manifest)."""
    return {k: ui_manifest_section(k) for k in keys}


def ui_manifest() -> UiManifest:
    return {s.key: _build_section(s) for s in SECTIONS}  # type: ignore[return-value]


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #

def _check(kind: SectionKind, value: Any) -> list[str]:
    errs: list[str] = []
    if kind == "str":
        if not isinstance(value, str) or not value:
            errs.append("expected non-empty str")
    elif kind in ("strs", "ids"):
        if not isinstance(value, list):
            return ["expected list"]
        bad = [v for v in value if not isinstance(v, str) or not v]
        if bad:
            errs.append(f"non-string or empty entries: {bad[:3]}")
        if kind == "ids":
            seen: set[str] = set()
            dups = sorted({v for v in value if isinstance(v, str) and (v in seen or seen.add(v))})
            if dups:
                errs.append(f"duplicate ids: {dups}")
    elif kind == "ints":
        if not isinstance(value, list) or any(
            isinstance(v, bool) or not isinstance(v, int) for v in value
        ):
            errs.append("expected list[int]")
    elif kind == "records":
        if not isinstance(value, list) or any(not isinstance(v, dict) for v in value):
            errs.append("expected list[dict]")
    elif kind == "mapping":
        if not isinstance(value, dict) or any(
            not isinstance(k, str) or not isinstance(v, str) for k, v in value.items()
        ):
            errs.append("expected dict[str, str]")
    return errs


def validate_ui_manifest(manifest: Mapping[str, Any] | None = None) -> list[str]:
    """Return a list of human-readable problems (empty list = valid)."""
    m = manifest if manifest is not None else ui_manifest()
    problems: list[str] = []
    for key in _BY_KEY:
        if key not in m:
            problems.append(f"{key}: missing")
            continue
        problems.extend(f"{key}: {e}" for e in _check(_BY_KEY[key].kind, m[key]))
    problems.extend(f"{k}: unexpected key" for k in m if k not in _BY_KEY)
    return problems


# --------------------------------------------------------------------------- #
# Serialisation, hashing, counts
# --------------------------------------------------------------------------- #

def ui_manifest_json(*, indent: int | None = 2) -> str:
    """Stable JSON (keys sorted) - handy for committing a snapshot next to Rust's."""
    return json.dumps(ui_manifest(), ensure_ascii=False, sort_keys=True, indent=indent)


def ui_manifest_hash(manifest: Mapping[str, Any] | None = None) -> str:
    """SHA-256 over canonical JSON. Compare Python vs Rust to detect drift cheaply."""
    m = manifest if manifest is not None else ui_manifest()
    canonical = json.dumps(m, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def ui_manifest_counts() -> dict[str, int]:
    """Entry counts per list/dict section - useful for logging and sanity checks."""
    m = ui_manifest()
    return {k: len(v) for k, v in m.items() if isinstance(v, (list, dict))}


# --------------------------------------------------------------------------- #
# Diff
# --------------------------------------------------------------------------- #

def diff_ui_manifest(old: Mapping[str, Any], new: Mapping[str, Any]) -> dict[str, Any]:
    """Structured diff between two manifests (e.g. a stored snapshot vs. the current one).

    Returns ``{"addedKeys", "removedKeys", "changed": {key: ...}}``. For list sections
    ``changed[key]`` has ``added`` / ``removed`` (and ``reordered`` when only order
    differs); for other types it has ``old`` / ``new``.
    """
    changed: dict[str, Any] = {}
    for key in old.keys() & new.keys():
        a, b = old[key], new[key]
        if a == b:
            continue
        if isinstance(a, list) and isinstance(b, list):
            try:
                added = [x for x in b if x not in a]
                removed = [x for x in a if x not in b]
            except TypeError:  # unhashable / odd content
                added, removed = [], []
            entry: dict[str, Any] = {"added": added, "removed": removed}
            if not added and not removed:
                entry["reordered"] = True
            changed[key] = entry
        else:
            changed[key] = {"old": a, "new": b}
    return {
        "addedKeys": sorted(new.keys() - old.keys()),
        "removedKeys": sorted(old.keys() - new.keys()),
        "changed": dict(sorted(changed.items())),
    }