"""Whats New edition highlights — ids must match en/sk locale keys."""

from __future__ import annotations

WHATS_NEW_50_HIGHLIGHTS: tuple[str, ...] = (
    "nativeCore",
    "wikiNative",
    "taskAgenda",
    "sourceExport",
    "stillLocal",
)

WHATS_NEW_50_TAG_KEYS: tuple[str, ...] = ("native", "library", "editor")

# Deprecated aliases — prefer WHATS_NEW_50_*.
WHATS_NEW_40_HIGHLIGHTS = WHATS_NEW_50_HIGHLIGHTS
WHATS_NEW_40_TAG_KEYS = WHATS_NEW_50_TAG_KEYS

EDITION_MARK_KEY = "whatsNew.editionMark"


def whats_new_highlights() -> list[str]:
    return list(WHATS_NEW_50_HIGHLIGHTS)


def whats_new_tag_keys() -> list[str]:
    return list(WHATS_NEW_50_TAG_KEYS)
