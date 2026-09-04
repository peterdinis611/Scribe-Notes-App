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


class OutlineTests(unittest.TestCase):
    def test_extracts_markdown_headings(self) -> None:
        text = "# Úvod\n\nText.\n\n## Plán\n\nĎalší text.\n\n### Detail\n"
        result = extract_outline(text)
        titles = [item["title"] for item in result["items"]]
        self.assertEqual(titles[:3], ["Úvod", "Plán", "Detail"])


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


if __name__ == "__main__":
    unittest.main()
