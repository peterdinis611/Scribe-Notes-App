"""HTML chrome builders for Scribe (Python twin of Dioxus ``scribe-ui`` components).

Produces markup that uses the shared ``chrome.css`` classes and ``data-sui-event``
bridge attributes so Tauri / WebView can host the same surfaces as Rust SSR.
"""

from .components import (
    folio_count,
    folio_kicker,
    folio_lead,
    folio_numeral,
    folio_tags,
    folio_title,
    sui_actions,
    sui_button,
    sui_card,
    sui_link_button,
    sui_meta_row,
    sui_panel,
)
from .document import chrome_css, wrap_document
from .nodes import Tag, attr, el, fragment, raw, text
from .surfaces import (
    SURFACE_IDS,
    render_about,
    render_docs,
    render_privacy,
    render_surface,
    render_welcome,
    render_whats_new,
)

__all__ = [
    "SURFACE_IDS",
    "Tag",
    "attr",
    "chrome_css",
    "el",
    "folio_count",
    "folio_kicker",
    "folio_lead",
    "folio_numeral",
    "folio_tags",
    "folio_title",
    "fragment",
    "raw",
    "render_about",
    "render_docs",
    "render_privacy",
    "render_surface",
    "render_welcome",
    "render_whats_new",
    "sui_actions",
    "sui_button",
    "sui_card",
    "sui_link_button",
    "sui_meta_row",
    "sui_panel",
    "text",
    "wrap_document",
]
