"""Whats New edition highlights — ids must match en/sk locale keys."""

from __future__ import annotations

WHATS_NEW_38_HIGHLIGHTS: tuple[str, ...] = (
    "tanstackMarkdown",
    "captureInbox",
    "syncMergeStudio",
    "wikiHealthQueue",
    "mcpWriteCountdown",
)

WHATS_NEW_38_TAG_KEYS: tuple[str, ...] = ("library", "capture", "markdown")

# Back-compat aliases for older imports / tests.
WHATS_NEW_37_HIGHLIGHTS = WHATS_NEW_38_HIGHLIGHTS
WHATS_NEW_37_TAG_KEYS = WHATS_NEW_38_TAG_KEYS
WHATS_NEW_36_HIGHLIGHTS = WHATS_NEW_38_HIGHLIGHTS
WHATS_NEW_36_TAG_KEYS = WHATS_NEW_38_TAG_KEYS
WHATS_NEW_35_HIGHLIGHTS = WHATS_NEW_38_HIGHLIGHTS
WHATS_NEW_34_HIGHLIGHTS = WHATS_NEW_38_HIGHLIGHTS

EDITION_MARK_KEY = "whatsNew.editionMark"


def whats_new_highlights() -> list[str]:
    return list(WHATS_NEW_38_HIGHLIGHTS)


def whats_new_tag_keys() -> list[str]:
    return list(WHATS_NEW_38_TAG_KEYS)
