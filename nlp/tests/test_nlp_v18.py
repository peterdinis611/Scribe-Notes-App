from __future__ import annotations

import unittest

from scribe_nlp import __version__
from scribe_nlp.open_loops import open_loops
from scribe_nlp.server import handle_request
from scribe_nlp.tone import tone_pack


def rpc(method: str, params: dict | None = None) -> dict:
    return handle_request(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or {},
        }
    )


class NlpV18Tests(unittest.TestCase):
    def test_version(self) -> None:
        self.assertEqual(__version__, "1.8.0")
        health = rpc("health")["result"]
        self.assertEqual(health["version"], "1.8.0")
        for feature in ("openLoops", "tonePack"):
            self.assertIn(feature, health["features"])

    def test_open_loops(self) -> None:
        text = "- [ ] Finish export ASAP\nI will review PRs by Monday.\n- [x] Already done"
        result = open_loops(text, limit=8)
        self.assertGreaterEqual(result["count"], 1)
        self.assertGreaterEqual(result["openTaskCount"], 1)
        response = rpc("open_loops", {"text": text})
        self.assertNotIn("error", response)

    def test_tone_pack(self) -> None:
        text = (
            "This calm note celebrates great progress. "
            "Readers love clear sentences and hopeful next steps."
        )
        result = tone_pack(text)
        self.assertIn(result["polarity"], {"positive", "neutral", "mixed", "negative"})
        self.assertGreater(result["wordCount"], 5)
        response = rpc("tone_pack", {"text": text})
        self.assertNotIn("error", response)
