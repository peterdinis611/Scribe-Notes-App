from __future__ import annotations

import unittest

from scribe_nlp.keywords import extract_keywords
from scribe_nlp.language import detect_language
from scribe_nlp.outline import extract_outline
from scribe_nlp.similar import similar_notes
from scribe_nlp.server import handle_request


class KeywordsTests(unittest.TestCase):
    def test_prefers_content_words_over_stopwords(self) -> None:
        text = (
            "Scribe je lokálny editor. Scribe ukladá poznámky do knižnice. "
            "Knižnica obsahuje projekty a denník. Projekty majú tagy."
        )
        result = extract_keywords(text, limit=8)
        terms = [item["term"] for item in result["keywords"]]
        self.assertTrue(terms)
        self.assertNotIn("je", terms)
        self.assertNotIn("do", terms)
        self.assertTrue(any(term in {"scribe", "knižnica", "projekty", "poznámky"} for term in terms))


class LanguageTests(unittest.TestCase):
    def test_detects_slovak(self) -> None:
        text = "Dnes som napísal poznámku do denníka, pretože potrebujem prehľad úloh."
        result = detect_language(text)
        self.assertEqual(result["language"], "sk")
        self.assertGreater(result["confidence"], 0.4)

    def test_detects_english(self) -> None:
        text = "Today I wrote a note in the journal because I need an overview of tasks."
        result = detect_language(text)
        self.assertEqual(result["language"], "en")
        self.assertGreater(result["confidence"], 0.4)

    def test_unknown_for_tiny_or_ambiguous_text(self) -> None:
        tiny = detect_language("ok")
        self.assertEqual(tiny["language"], "unknown")
        empty = detect_language("")
        self.assertEqual(empty["language"], "unknown")


class OutlineTests(unittest.TestCase):
    def test_extracts_markdown_headings(self) -> None:
        text = "# Úvod\n\nText.\n\n## Plán\n\nĎalší text.\n\n### Detail\n"
        result = extract_outline(text)
        titles = [item["title"] for item in result["items"]]
        self.assertEqual(titles[:3], ["Úvod", "Plán", "Detail"])

    def test_falls_back_to_numbered_sections(self) -> None:
        text = "1. Prvý bod\n2. Druhý bod\n3. Tretí bod\n"
        result = extract_outline(text)
        titles = [item["title"] for item in result["items"]]
        self.assertIn("Prvý bod", titles)
        self.assertTrue(all(item["kind"] in {"section", "heading", "label", "sentence"} for item in result["items"]))


class SimilarTests(unittest.TestCase):
    def test_ranks_related_notes(self) -> None:
        docs = [
            {"id": "1", "title": "Projekt Scribe", "text": "Lokálny editor poznámok Scribe."},
            {"id": "2", "title": "Recepty", "text": "Cesto, múka, pečenie chleba."},
            {"id": "3", "title": "Scribe roadmap", "text": "Scribe NLP a knižnica poznámok."},
        ]
        result = similar_notes("Scribe poznámky knižnica", docs, limit=2)
        ids = [item["id"] for item in result["matches"]]
        self.assertIn("1", ids)
        self.assertIn("3", ids)
        self.assertNotIn("2", ids[:1] if ids[:1] == ["2"] else ids)

    def test_empty_query_or_docs(self) -> None:
        self.assertEqual(similar_notes("", [{"id": "1", "title": "A", "text": "B"}], 5)["matches"], [])
        self.assertEqual(similar_notes("Scribe", [], 5)["matches"], [])


class ServerMethodTests(unittest.TestCase):
    def test_new_methods_in_health_features(self) -> None:
        response = handle_request({"jsonrpc": "2.0", "id": 1, "method": "health", "params": {}})
        features = response["result"]["features"]
        for name in ("keywords", "language", "outline", "similar"):
            self.assertIn(name, features)

    def test_extract_keywords_rpc(self) -> None:
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "extract_keywords",
                "params": {"text": "Scribe knižnica poznámok a projekty v Scribe."},
            }
        )
        self.assertIn("keywords", response["result"])

    def test_detect_language_and_outline_rpc(self) -> None:
        language = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "detect_language",
                "params": {"text": "This is an English paragraph about writing notes."},
            }
        )["result"]
        self.assertEqual(language["language"], "en")

        outline = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "extract_outline",
                "params": {"text": "# One\n\n## Two\n"},
            }
        )["result"]
        self.assertEqual(outline["count"], 2)


if __name__ == "__main__":
    unittest.main()
