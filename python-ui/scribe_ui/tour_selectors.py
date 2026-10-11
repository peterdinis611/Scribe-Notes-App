"""Stable ``data-tour`` ids for the guided product tour (`crates/scribe-ui` tour_selectors)."""

from __future__ import annotations

from typing import TypedDict


class TourTarget(TypedDict):
    key: str
    id: str


TOUR_TARGETS: tuple[TourTarget, ...] = (
    {"key": "sidebarRail", "id": "sidebar-rail"},
    {"key": "libraryPanel", "id": "library-panel"},
    {"key": "librarySwitcher", "id": "library-switcher"},
    {"key": "librarySearch", "id": "library-search"},
    {"key": "libraryViews", "id": "library-views"},
    {"key": "libraryChat", "id": "library-chat"},
    {"key": "libraryFilters", "id": "library-filters"},
    {"key": "libraryTree", "id": "library-tree"},
    {"key": "libraryCompile", "id": "library-compile"},
    {"key": "appHeader", "id": "app-header"},
    {"key": "newDocument", "id": "new-document"},
    {"key": "documentTabs", "id": "document-tabs"},
    {"key": "editorToolbar", "id": "editor-toolbar"},
    {"key": "editorCanvas", "id": "editor-canvas"},
    {"key": "panelRail", "id": "panel-rail"},
    {"key": "panelOutline", "id": "panel-outline"},
    {"key": "panelInsights", "id": "panel-insights"},
    {"key": "statusBar", "id": "status-bar"},
    {"key": "settingsNav", "id": "settings-nav"},
)


def tour_selector_for_id(id_: str) -> str:
    return f'[data-tour="{id_}"]'


def tour_selector(key: str) -> str | None:
    for target in TOUR_TARGETS:
        if target["key"] == key:
            return tour_selector_for_id(target["id"])
    return None


def tour_target_ids() -> list[str]:
    return [t["id"] for t in TOUR_TARGETS]


def is_tour_id(id_: str) -> bool:
    return any(t["id"] == id_ for t in TOUR_TARGETS)
