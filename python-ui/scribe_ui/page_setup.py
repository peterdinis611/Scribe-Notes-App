"""Page size catalog ids (`crates/scribe-ui` page_setup)."""

from __future__ import annotations

from typing import TypedDict


class PaperSize(TypedDict):
    id: str
    label: str
    width: float
    height: float


def paper_sizes() -> list[PaperSize]:
    return [
        {"id": "a4", "label": "A4", "width": 794.0, "height": 1123.0},
        {"id": "letter", "label": "Letter (US)", "width": 816.0, "height": 1056.0},
        {"id": "a5", "label": "A5", "width": 559.0, "height": 794.0},
    ]


def paper_size_ids() -> list[str]:
    return [p["id"] for p in paper_sizes()]
