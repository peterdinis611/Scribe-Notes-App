from __future__ import annotations

import unittest
from datetime import date

from scribe_nlp.dates import extract_dates
from scribe_nlp.diff_summary import summarize_diff
from scribe_nlp.duplicates import find_duplicates
from scribe_nlp.mentions import extract_mentions
from scribe_nlp.readability import reading_stats
from scribe_nlp.sentiment import analyze_sentiment
from scribe_nlp.server import handle_request
from scribe_nlp.template_hints import template_fill_hints
from scribe_nlp.title import suggest_title


class ReadabilityTests(unittest.TestCase):
    def test_reading_time_positive(self) -> None:
        text = " ".join(["slovo"] * 200)
        result = reading_stats(text)
        self.assertGreater(result["readingTimeMinutes"], 0.5)
        self.assertIn(result["readabilityLabel"], {"veryEasy", "easy", "plain", "dense", "hard"})


class DuplicateTests(unittest.TestCase):
    def test_finds_near_duplicates(self) -> None:
        documents = [
            {
                "id": "a",
                "title": "Scribe NLP",
                "text": "Lokálne embeddings a sémantické vyhľadávanie poznámok v Scribe aplikácii",
            },
            {
                "id": "b",
                "title": "Scribe NLP kópia",
                "text": "Lokálne embeddings a sémantické vyhľadávanie poznámok v Scribe aplikácii",
            },
            {
                "id": "c",
                "title": "Polievka",
                "text": "Recept na paradajkovú polievku s bazalkou cesnakom a olivovým olejom",
            },
        ]
        result = find_duplicates(documents, limit=5, min_score=0.5)
        pairs = result["pairs"]
        self.assertGreaterEqual(len(pairs), 1)
        top = pairs[0]
        self.assertEqual({top["leftId"], top["rightId"]}, {"a", "b"})


class TitleTests(unittest.TestCase):
    def test_heading_title(self) -> None:
        result = suggest_title("# Týždenný plán\n\nText o projekte.")
        self.assertEqual(result["title"], "Týždenný plán")
        self.assertTrue(result["slug"])


class MentionsTests(unittest.TestCase):
    def test_extracts_wiki_mention_and_host(self) -> None:
        text = "Pozri [[Scribe roadmap]] a napíš @peter. https://example.com/docs"
        result = extract_mentions(text)
        self.assertIn("Scribe roadmap", result["wikiLinks"])
        self.assertIn("peter", result["mentions"])
        self.assertIn("example.com", result["hosts"])


class SentimentTests(unittest.TestCase):
    def test_positive_tone(self) -> None:
        result = analyze_sentiment("Today was great and I feel happy and grateful for progress.")
        self.assertEqual(result["label"], "positive")


class DatesTests(unittest.TestCase):
    def test_relative_and_absolute(self) -> None:
        base = date(2026, 9, 6)
        result = extract_dates("Meeting zajtra and deadline do 15.3.2026", today=base)
        texts = {item["text"].lower() for item in result["events"]}
        self.assertTrue(any("zajtra" in text for text in texts))
        self.assertTrue(any("15.3.2026" in text or "do 15.3.2026" in text for text in texts))
        resolved = {item.get("resolvedDate") for item in result["events"]}
        self.assertIn("2026-09-07", resolved)
        self.assertIn("2026-03-15", resolved)
        # Absolute duplicate of deadline day should be collapsed.
        absolute_hits = [
            item
            for item in result["events"]
            if item.get("kind") == "absolute" and item.get("resolvedDate") == "2026-03-15"
        ]
        self.assertEqual(absolute_hits, [])

    def test_offset_and_due_hint(self) -> None:
        from scribe_nlp.dates import resolve_due_hint

        base = date(2026, 9, 6)
        self.assertEqual(resolve_due_hint("Ship o 3 dni", today=base), "2026-09-09")
        self.assertEqual(resolve_due_hint("Call do zajtra", today=base), "2026-09-07")


class DiffTests(unittest.TestCase):
    def test_summarize_diff_detects_added(self) -> None:
        old = "First sentence stays. Second stays too."
        new = "First sentence stays. Second stays too. Brand new conclusion arrives here."
        result = summarize_diff(old, new)
        self.assertGreaterEqual(len(result["addedSentences"]), 1)


class TemplateTests(unittest.TestCase):
    def test_missing_sections(self) -> None:
        text = "## Cieľ\n\nShip NLP.\n\n## Kontext\n\nLocal AI."
        result = template_fill_hints(text, ["Cieľ", "Kontext", "Next steps"])
        self.assertIn("Next steps", result["missing"])
        self.assertIn("Cieľ", result["present"])


class ServerFeatureTests(unittest.TestCase):
    def test_health_lists_new_features(self) -> None:
        result = handle_request(
            {"jsonrpc": "2.0", "id": 1, "method": "health", "params": {}}
        )["result"]
        self.assertEqual(result["version"], "0.8.1")
        for feature in ("readability", "duplicates", "sentiment", "dates", "diff", "template"):
            self.assertIn(feature, result["features"])

    def test_analyze_includes_new_fields(self) -> None:
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "analyze_document",
                "params": {
                    "text": (
                        "# Roadmap\n\n"
                        "Dnes som šťastný z pokroku. Meeting zajtra s @anna. "
                        "Pozri [[Scribe]] a https://example.com. "
                        "Treba: dokončiť report do 2026-09-10."
                    )
                },
            }
        )
        result = response["result"]
        self.assertIn("readability", result)
        self.assertIn("sentiment", result)
        self.assertIn("mentions", result)
        self.assertTrue(result.get("suggestedTitle"))


if __name__ == "__main__":
    unittest.main()
