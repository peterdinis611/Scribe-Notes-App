from __future__ import annotations

import unittest

from scribe_nlp import __version__
from scribe_nlp.commitments import extract_commitments
from scribe_nlp.note_pulse import note_pulse
from scribe_nlp.reading_plan import reading_plan
from scribe_nlp.server import handle_request


def rpc(method: str, params: dict | None = None) -> dict:
    return handle_request(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or {},
        }
    )


class NlpV17Tests(unittest.TestCase):
    def test_version(self) -> None:
        self.assertGreaterEqual(tuple(int(p) for p in __version__.split(".")[:2]), (1, 7))
        health = rpc("health")["result"]
        for feature in ("extractCommitments", "readingPlan", "notePulse"):
            self.assertIn(feature, health["features"])

    def test_extract_commitments(self) -> None:
        text = (
            "I will finish the export polish tonight. "
            "Commitment: review the meeting notes by Monday. "
            "Záväzok: poslať zápis klientovi."
        )
        result = extract_commitments(text, limit=8)
        self.assertGreaterEqual(result["count"], 2)
        response = rpc("extract_commitments", {"text": text})
        self.assertNotIn("error", response)

    def test_reading_plan(self) -> None:
        text = (
            "# Intro\n\n"
            "This chapter introduces local agents and how they plan tools.\n"
            "Writers stay offline while the sidecar ranks intents.\n\n"
            "# Practice\n\n"
            "Try turning a meeting note into decisions and ranked tasks.\n"
            "Then teach the agent a standing grammar preference.\n"
        )
        result = reading_plan(text, limit=4)
        self.assertGreaterEqual(result["count"], 2)
        self.assertGreater(result["estimatedMinutes"], 0)
        response = rpc("reading_plan", {"text": text})
        self.assertNotIn("error", response)

    def test_note_pulse(self) -> None:
        text = "- [ ] Ship agent roles\nDeadline tomorrow\nEmail me at a@b.com\n"
        result = note_pulse(text)
        self.assertIn(result["piiRisk"], {"low", "medium", "high"})
        self.assertGreaterEqual(result["openTaskCount"], 1)
        response = rpc("note_pulse", {"text": text})
        self.assertNotIn("error", response)
        self.assertEqual(response["result"]["source"], "python")
