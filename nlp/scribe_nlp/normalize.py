from __future__ import annotations

import re

# Fold SK/CS diacritics for matching (pisanie ≈ písanie).
_DIACRITIC_TABLE = str.maketrans(
    {
        "á": "a",
        "ä": "a",
        "č": "c",
        "ď": "d",
        "é": "e",
        "í": "i",
        "ĺ": "l",
        "ľ": "l",
        "ň": "n",
        "ó": "o",
        "ô": "o",
        "ŕ": "r",
        "š": "s",
        "ť": "t",
        "ú": "u",
        "ý": "y",
        "ž": "z",
    }
)

# Longest-first SK/EN inflection / derivational suffixes (lite, not a real stemmer).
_SUFFIXES = (
    "ami",
    "ách",
    "ach",
    "och",
    "ých",
    "ych",
    "ými",
    "ymi",
    "ého",
    "emu",
    "tion",
    "sion",
    "ness",
    "ment",
    "ing",
    "ers",
    "ies",
    "ied",
    "ová",
    "ova",
    "ovej",
    "ového",
    "ovom",
    "ovi",
    "och",
    "ami",
    "ách",
    "ach",
    "om",
    "ou",
    "ov",
    "mi",
    "ím",
    "im",
    "ém",
    "em",
    "ej",
    "ia",
    "ie",
    "iu",
    "á",
    "a",
    "é",
    "e",
    "í",
    "i",
    "ý",
    "y",
    "ú",
    "u",
    "ó",
    "o",
    "ed",
    "es",
    "s",
)


def fold_diacritics(value: str) -> str:
    return (value or "").lower().translate(_DIACRITIC_TABLE)


def stem_lite(token: str) -> str:
    """Aggressive-enough fold for SK/EN matching without external deps."""
    folded = fold_diacritics(token)
    if len(folded) <= 3:
        return folded
    for suffix in _SUFFIXES:
        if len(folded) > len(suffix) + 3 and folded.endswith(suffix):
            return folded[: -len(suffix)]
    return folded


def stems_equal(left: str, right: str) -> bool:
    return stem_lite(left) == stem_lite(right)
