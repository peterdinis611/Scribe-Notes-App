"""Paragraph style catalog (`crates/scribe-ui` paragraph_styles)."""

from __future__ import annotations

from typing import Any, TypedDict

PARAGRAPH_STYLE_IDS: tuple[str, ...] = (
    "title",
    "subtitle",
    "heading",
    "body",
    "caption",
)


class ParagraphStyleDef(TypedDict):
    id: str
    label: str
    hint: str


def paragraph_style_ids() -> list[str]:
    return list(PARAGRAPH_STYLE_IDS)


def is_paragraph_style_id(style_id: str) -> bool:
    return style_id in PARAGRAPH_STYLE_IDS


def paragraph_styles() -> list[ParagraphStyleDef]:
    return [
        {"id": "title", "label": "Titulok", "hint": "Hlavný názov dokumentu"},
        {"id": "subtitle", "label": "Podtitul", "hint": "Podnadpis alebo perex"},
        {"id": "heading", "label": "Nadpis sekcie", "hint": "Sekčný nadpis"},
        {"id": "body", "label": "Text", "hint": "Bežný odsek"},
        {"id": "caption", "label": "Popisok", "hint": "Malý popis pod obrázkom"},
    ]


def resolve_paragraph_style(style_id: str) -> dict[str, Any] | None:
    table: dict[str, dict[str, Any]] = {
        "title": {
            "id": "title",
            "nodeType": "heading",
            "headingLevel": 1,
            "lineHeight": "1.15",
            "spaceBefore": "0px",
            "spaceAfter": "12px",
            "fontSize": "32px",
            "italic": False,
            "clearBold": False,
            "textAlign": None,
        },
        "subtitle": {
            "id": "subtitle",
            "nodeType": "heading",
            "headingLevel": 2,
            "lineHeight": "1.25",
            "spaceBefore": "0px",
            "spaceAfter": "10px",
            "fontSize": "22px",
            "italic": False,
            "clearBold": False,
            "textAlign": None,
        },
        "heading": {
            "id": "heading",
            "nodeType": "heading",
            "headingLevel": 3,
            "lineHeight": "1.3",
            "spaceBefore": "12px",
            "spaceAfter": "8px",
            "fontSize": "18px",
            "italic": False,
            "clearBold": False,
            "textAlign": None,
        },
        "body": {
            "id": "body",
            "nodeType": "paragraph",
            "headingLevel": None,
            "lineHeight": "1.6",
            "spaceBefore": "0px",
            "spaceAfter": "0px",
            "fontSize": None,
            "italic": False,
            "clearBold": True,
            "textAlign": None,
        },
        "caption": {
            "id": "caption",
            "nodeType": "paragraph",
            "headingLevel": None,
            "lineHeight": "1.4",
            "spaceBefore": "6px",
            "spaceAfter": "0px",
            "fontSize": "12px",
            "italic": True,
            "clearBold": False,
            "textAlign": "center",
        },
    }
    attrs = table.get(style_id)
    return None if attrs is None else dict(attrs)
