from __future__ import annotations

import unittest

from scribe_nlp import __version__
from scribe_nlp.contradictions import contradiction_hints
from scribe_nlp.decisions import extract_decisions
from scribe_nlp.pii import detect_pii
from scribe_nlp.quotes import extract_quotes
from scribe_nlp.section_summaries import section_summaries
from scribe_nlp.server import handle_request
from scribe_nlp.task_rank import rank_tasks


def rpc(method: str, params: dict | None = None) -> dict:
    return handle_request(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or {},
        }
    )


class NlpV16Tests(unittest.TestCase):
    def test_version(self) -> None:
        self.assertGreaterEqual(tuple(int(p) for p in __version__.split(".")[:2]), (1, 6))
        health = rpc("health")["result"]
        for feature in (
            "sectionSummaries",
            "extractDecisions",
            "extractQuotes",
            "detectPii",
            "rankTasks",
            "contradictionHints",
        ):
            self.assertIn(feature, health["features"])

    def test_section_summaries(self) -> None:
        text = (
            "# Search\n\n"
            "Local embeddings power semantic search in Scribe for writers.\n"
            "The index stays on your machine and never leaves the device.\n\n"
            "# Export\n\n"
            "You can export notes as Markdown, HTML, or PDF from the menu.\n"
            "PDF export supports page setup and structured templates.\n"
        )
        result = section_summaries(text, limit=4)
        self.assertGreaterEqual(result["count"], 2)
        titles = [item["title"] for item in result["sections"]]
        self.assertIn("Search", titles)
        self.assertIn("Export", titles)
        response = rpc("section_summaries", {"text": text, "limit": 4})
        self.assertNotIn("error", response)

    def test_extract_decisions(self) -> None:
        text = (
            "We decided to ship the revision AI this week. "
            "Decision: keep NLP fully local. "
            "Rozhodnutie: žiadny cloud API."
        )
        result = extract_decisions(text, limit=8)
        self.assertGreaterEqual(result["count"], 2)
        response = rpc("extract_decisions", {"text": text})
        self.assertNotIn("error", response)
        self.assertGreaterEqual(response["result"]["count"], 1)

    def test_extract_quotes(self) -> None:
        text = 'Alice said "Local-first notes beat the cloud every time." — Alice'
        result = extract_quotes(text, limit=5)
        self.assertGreaterEqual(result["count"], 1)
        self.assertTrue(any("Local-first" in q["text"] for q in result["quotes"]))

    def test_detect_pii(self) -> None:
        text = "Contact me at writer@example.com or +421 900 123 456 before sharing."
        result = detect_pii(text)
        self.assertGreaterEqual(result["count"], 1)
        self.assertIn(result["risk"], {"medium", "high"})
        self.assertFalse(result["safeToShare"])
        # Redacted payload should not echo the full email
        joined = " ".join(item["match"] for item in result["findings"])
        self.assertNotIn("writer@example.com", joined)

    def test_detect_pii_api_key_high_risk(self) -> None:
        text = "token sk-abcdefghijklmnopqrstuvwxyz012345"
        result = detect_pii(text)
        self.assertEqual(result["risk"], "high")

    def test_rank_tasks(self) -> None:
        text = (
            "- [ ] Buy milk someday\n"
            "- [ ] Ship blocker ASAP today\n"
            "- [x] Already done\n"
            "- [ ] Optional polish later\n"
        )
        result = rank_tasks(text, limit=5)
        self.assertGreaterEqual(result["count"], 2)
        self.assertIn("Ship blocker", result["tasks"][0]["text"])

    def test_contradiction_hints(self) -> None:
        a = "The launch is scheduled for Monday and the team will ship on Monday."
        b = "The launch is not scheduled for Monday; we will never ship on Monday."
        result = contradiction_hints(a, b, limit=5)
        self.assertGreaterEqual(result["count"], 1)
        response = rpc(
            "contradiction_hints",
            {"textA": a, "textB": b, "limit": 5},
        )
        self.assertNotIn("error", response)


if __name__ == "__main__":
    unittest.main()
