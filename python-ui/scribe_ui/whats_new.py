"""Whats New edition highlights — ids must match en/sk locale keys."""

from __future__ import annotations

WHATS_NEW_34_HIGHLIGHTS: tuple[str, ...] = (
    "specialistAgents",
    "agentHandoffs",
    "digestsRecipes",
    "spawnAndCalendar",
    "filesIngest",
)

EDITION_MARK_KEY = "whatsNew.editionMark"


def whats_new_highlights() -> list[str]:
    return list(WHATS_NEW_34_HIGHLIGHTS)
