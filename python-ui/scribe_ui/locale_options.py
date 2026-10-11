"""Built-in locale codes (`crates/scribe-ui` locale_options)."""

from __future__ import annotations

BUILT_IN_LOCALES: tuple[str, ...] = ("sk", "en")
DEFAULT_LOCALE = "sk"


def built_in_locales() -> list[str]:
    return list(BUILT_IN_LOCALES)
