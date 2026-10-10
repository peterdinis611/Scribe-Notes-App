"""Settings section ids shared with the FE router / Rust settings_nav."""

from __future__ import annotations

SETTINGS_SECTION_IDS: tuple[str, ...] = (
    "appearance",
    "interface",
    "storage",
    "shortcuts",
    "diagnostics",
    "mcp",
    "nlp",
    "agent",
    "capture",
    "privacy",
    "about",
)


def is_settings_section(value: str) -> bool:
    return value in SETTINGS_SECTION_IDS


def settings_section_ids() -> list[str]:
    return list(SETTINGS_SECTION_IDS)
