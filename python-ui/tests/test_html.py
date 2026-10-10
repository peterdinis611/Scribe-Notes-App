from __future__ import annotations

import unittest

from scribe_ui.html import (
    el,
    render_surface,
    render_whats_new,
    sui_button,
    text,
    wrap_document,
)


class HtmlBuilderTests(unittest.TestCase):
    def test_escapes_text(self) -> None:
        node = el("p", text("<script>alert(1)</script>"), class_="lead")
        html = node.render()
        self.assertIn("&lt;script&gt;", html)
        self.assertNotIn("<script>", html)

    def test_button_bridge_attrs(self) -> None:
        html = sui_button("Go", event="welcome-new-document", variant="primary").render()
        self.assertIn('data-sui-event="welcome-new-document"', html)
        self.assertIn('class="primary"', html)

    def test_whats_new_document(self) -> None:
        html = render_whats_new(version="3.4.0", short="3.4")
        self.assertIn("<!doctype html>", html)
        self.assertIn("data-sui-surface=\"whats-new\"", html)
        self.assertIn("setup-folio--news", html)
        self.assertIn("whats-new-acked", html)
        self.assertIn("--color-accent", html)  # chrome.css embedded

    def test_fragment_mode(self) -> None:
        html = render_surface("welcome", full_document=False)
        self.assertNotIn("<!doctype html>", html)
        self.assertIn("sui-panel", html)
        self.assertIn("welcome-new-document", html)

    def test_wrap_document(self) -> None:
        html = wrap_document("<p>hi</p>", "about")
        self.assertIn("data-sui-surface=\"about\"", html)
        self.assertIn("scribeUiBridge", html)

    def test_docs_surface_matches_app_copy(self) -> None:
        html = render_surface("docs", short_version="3.4", full_document=False)
        self.assertIn('class="docs-shell"', html)
        self.assertIn("Scribe 3.4", html)
        self.assertIn("field guide to writing, linking, and keeping your library", html)
        self.assertIn("Search topics…", html)
        self.assertIn("Basics", html)
        self.assertIn("What is Scribe 3.4?", html)
        self.assertIn("Write documents. Link notes. Stay local.", html)
        self.assertIn("docs-topic-summary", html)
        self.assertIn("What stays on this Mac", html)
        self.assertIn("no Scribe account", html)
        self.assertIn('data-sui-filter="docs"', html)


if __name__ == "__main__":
    unittest.main()
