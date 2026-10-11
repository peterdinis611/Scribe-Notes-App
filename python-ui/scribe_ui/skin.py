"""UI skin ids (`crates/scribe-ui` skin)."""

from __future__ import annotations

UI_SKIN_STORAGE_KEY = "scribe-ui-skin"
UI_SKIN_IDS: tuple[str, ...] = ("grove", "classic")


def ui_skin_ids() -> list[str]:
    return list(UI_SKIN_IDS)


def is_ui_skin(value: str) -> bool:
    return value in UI_SKIN_IDS


def normalize_ui_skin(value: str) -> str:
    if value == "classic":
        return "classic"
    # Legacy Copper Press → Grove.
    return "grove"
