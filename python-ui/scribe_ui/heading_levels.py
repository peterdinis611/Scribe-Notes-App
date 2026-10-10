"""Heading level catalog (`crates/scribe-ui` heading_levels)."""

from __future__ import annotations

HEADING_LEVELS: tuple[int, ...] = (1, 2, 3, 4, 5, 6)


def is_heading_level(level: int) -> bool:
    return level in HEADING_LEVELS


def heading_levels() -> list[int]:
    return list(HEADING_LEVELS)


def heading_label(level: int) -> str:
    return f"Nadpis {level}"
