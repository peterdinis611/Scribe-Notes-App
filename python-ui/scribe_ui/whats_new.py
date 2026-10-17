"""Whats New edition highlights — ids must match en/sk locale keys."""

from __future__ import annotations

WHATS_NEW_40_HIGHLIGHTS: tuple[str, ...] = (
    "pageWorkspace",
    "editorCanvas",
    "welcomeHome",
    "auditInsights",
    "skinPicker",
)

WHATS_NEW_40_TAG_KEYS: tuple[str, ...] = ("workspace", "design", "audit")

EDITION_MARK_KEY = "whatsNew.editionMark"


def whats_new_highlights() -> list[str]:
    return list(WHATS_NEW_40_HIGHLIGHTS)


def whats_new_tag_keys() -> list[str]:
    return list(WHATS_NEW_40_TAG_KEYS)
