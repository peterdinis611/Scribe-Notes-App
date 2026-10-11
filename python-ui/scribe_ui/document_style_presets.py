"""Document page-style preset ids (`crates/scribe-ui` document_style_presets)."""

from __future__ import annotations

DOCUMENT_STYLE_PRESET_IDS: tuple[str, ...] = (
    "default",
    "academic",
    "letter",
    "blog",
    "manuscript",
)


def document_style_preset_ids() -> list[str]:
    return list(DOCUMENT_STYLE_PRESET_IDS)
