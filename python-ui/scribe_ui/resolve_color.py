"""Theme token → CSS color (mirrors ``crates/scribe-ui/src/resolve_color.rs``)."""

from __future__ import annotations

from typing import Mapping

THEME_COLOR_KEYS: tuple[str, ...] = (
    "foreground",
    "background",
    "muted",
    "mutedForeground",
    "primary",
    "primaryForeground",
    "border",
    "accent",
    "destructive",
    "success",
    "warning",
    "info",
)


def is_theme_color_key(value: str) -> bool:
    return value in THEME_COLOR_KEYS


def resolve_color(value: str, colors: Mapping[str, str]) -> str:
    """Return the token color when ``value`` is a known key; otherwise pass through."""
    key = (value or "").strip()
    if key in colors and key in THEME_COLOR_KEYS:
        return str(colors[key])
    # Accept snake_case keys from Python callers.
    snake = {
        "muted_foreground": "mutedForeground",
        "primary_foreground": "primaryForeground",
    }.get(key)
    if snake and snake in colors:
        return str(colors[snake])
    return value
