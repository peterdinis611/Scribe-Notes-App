from __future__ import annotations

import unittest

from scribe_nlp.server import handle_request


class RenderUiSurfaceTests(unittest.TestCase):
    def test_renders_whats_new(self) -> None:
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "render_ui_surface",
                "params": {
                    "surface": "whats-new",
                    "version": "3.5.0",
                    "shortVersion": "3.5",
                    "strings": {
                        "whatsNew.gotIt": "Got it",
                        "whatsNew.title": "Scribe {{version}}",
                    },
                },
            }
        )
        self.assertNotIn("error", response, response)
        result = response["result"]
        self.assertEqual(result["surface"], "whats-new")
        self.assertEqual(result["engine"], "python-ui")
        self.assertIn("Got it", result["html"])
        self.assertIn("setup-folio", result["html"])

    def test_fragment(self) -> None:
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "render_ui_surface",
                "params": {"surface": "about", "fragment": True},
            }
        )
        self.assertNotIn("error", response, response)
        html = response["result"]["html"]
        self.assertNotIn("<!doctype html>", html)
        self.assertIn("sui-panel", html)


if __name__ == "__main__":
    unittest.main()
