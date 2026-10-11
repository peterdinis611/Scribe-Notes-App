"""UI typography preset ids (`crates/scribe-ui` ui_fonts)."""

from __future__ import annotations

UI_FONTS_STORAGE_KEY = "scribe-ui-fonts-v1"

UI_FONT_PRESET_IDS: tuple[str, ...] = (
    "default",
    "system",
    "serif",
    "mono",
    "readable",
    "literary",
)


def ui_font_preset_ids() -> list[str]:
    return list(UI_FONT_PRESET_IDS)


def is_ui_font_preset_id(value: str) -> bool:
    return value in UI_FONT_PRESET_IDS
