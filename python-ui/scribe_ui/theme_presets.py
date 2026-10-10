"""Theme preset ids (`crates/scribe-ui` theme_presets) — catalog only."""

from __future__ import annotations

THEME_ID_CUSTOM = "custom"
THEME_ID_SYSTEM = "system"

THEME_PRESET_IDS: tuple[str, ...] = (
    "light",
    "dark",
    "sepia",
    "paper",
    "blotter",
    "rose",
    "nord",
    "midnight",
    "forest",
    "mint",
    "lavender",
    "solar",
    "ocean",
    "dracula",
    "coffee",
    "grape",
    "slate",
    "cherry",
    "arctic",
    "sandstorm",
    "neon",
    "graphite",
    "peach",
    "cobalt",
    "ember",
    "jade",
    "plum",
    "storm",
    "honey",
    "ink",
    "coral",
    "sage",
    "twilight",
)

CYCLE_THEME_ORDER: tuple[str, ...] = (
    "system",
    "light",
    "dark",
    "sepia",
    "paper",
    "rose",
    "mint",
    "lavender",
    "solar",
    "nord",
    "midnight",
    "forest",
    "ocean",
    "dracula",
    "coffee",
    "grape",
    "slate",
    "cherry",
    "arctic",
    "sandstorm",
    "neon",
    "graphite",
    "peach",
    "cobalt",
    "ember",
    "jade",
    "plum",
    "storm",
    "honey",
    "ink",
    "coral",
    "sage",
    "twilight",
)


def theme_preset_ids() -> list[str]:
    return list(THEME_PRESET_IDS)


def is_theme_id(value: str) -> bool:
    return value in THEME_PRESET_IDS or value in {THEME_ID_CUSTOM, THEME_ID_SYSTEM}


def next_cycle_theme(current: str) -> str:
    order = list(CYCLE_THEME_ORDER)
    try:
        idx = order.index(current)
        return order[(idx + 1) % len(order)]
    except ValueError:
        return order[0]
