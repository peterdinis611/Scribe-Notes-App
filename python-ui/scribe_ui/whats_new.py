"""Whats New edition highlights — ids must match en/sk locale keys."""

from __future__ import annotations

WHATS_NEW_35_HIGHLIGHTS: tuple[str, ...] = (
    "docsFieldGuide",
    "pythonUiChrome",
    "sharedUiCatalogs",
    "renderUiSurface",
    "welcomeSurfaces",
)

# Back-compat alias for older imports / tests.
WHATS_NEW_34_HIGHLIGHTS = WHATS_NEW_35_HIGHLIGHTS

EDITION_MARK_KEY = "whatsNew.editionMark"


def whats_new_highlights() -> list[str]:
    return list(WHATS_NEW_35_HIGHLIGHTS)
