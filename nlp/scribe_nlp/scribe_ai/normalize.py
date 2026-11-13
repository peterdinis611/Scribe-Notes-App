"""Text folding helpers — parity with Rust ``scribe-ai::normalize``."""

from __future__ import annotations

from ..normalize import fold_diacritics, stem_lite


def fold_text(value: str) -> str:
    """Lowercase + strip SK/CS diacritics."""
    return fold_diacritics((value or "").strip())


def collapse_ws(value: str) -> str:
    return " ".join((value or "").split())


__all__ = ["collapse_ws", "fold_diacritics", "fold_text", "stem_lite"]
