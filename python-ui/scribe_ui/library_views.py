"""Library sidebar view ids (FE LibraryViewTabs / Rust library_views)."""

from __future__ import annotations

LIBRARY_VIEW_IDS: tuple[str, ...] = (
    "folders",
    "recent",
    "favorites",
    "tags",
    "graph",
    "journal",
    "chat",
    "agent",
    "duplicates",
    "tasks",
    "database",
    "wikiHealth",
    "storage",
)


def library_view_ids() -> list[str]:
    return list(LIBRARY_VIEW_IDS)


def is_library_view_id(value: str) -> bool:
    return value in LIBRARY_VIEW_IDS
