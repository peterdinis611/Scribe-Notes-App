"""Locale key section groups (`crates/scribe-ui` locale_sections)."""

from __future__ import annotations

from typing import TypedDict


class LocaleSectionGroup(TypedDict):
    id: str
    sections: list[str]


def locale_section_groups() -> list[LocaleSectionGroup]:
    return [
        {
            "id": "core",
            "sections": [
                "common", "nav", "welcome", "settings", "toasts", "errors", "setup", "onboarding",
                "appTour", "whatsNew", "demoGuide", "fileMenu", "commandPalette", "shortcuts",
            ],
        },
        {
            "id": "editor",
            "sections": [
                "editor", "toolbar", "editorActions", "slash", "floatingMenu", "findReplace",
                "viewMode", "focusMode", "readingMode", "printLayout", "pageStyles", "pagination",
                "tableOfContents", "footnotes", "math", "lorem", "aiRewrite", "wikiLink", "wikiNav",
                "wikiEmbed", "wikiGhost", "emojiPicker", "codeBlock", "templates", "templateCoach",
            ],
        },
        {
            "id": "library",
            "sections": [
                "library", "libraryChat", "documentChat", "agent", "libraryFindReplace", "libraries",
                "trash", "journal", "linkGraph", "compile", "tabs", "split", "quickNote",
            ],
        },
        {
            "id": "panels",
            "sections": ["editorPanels", "panels", "nlp", "diagnostics", "pdfPreview", "structuredPdf"],
        },
        {
            "id": "media",
            "sections": [
                "image", "map", "video", "lottie", "model3d", "canvas", "mermaid", "d3Chart",
                "invoiceDialog", "capture",
            ],
        },
        {
            "id": "system",
            "sections": ["storageAccess", "diskSync", "syncConflicts", "vault"],
        },
    ]


def locale_section_group_ids() -> list[str]:
    return [g["id"] for g in locale_section_groups()]
