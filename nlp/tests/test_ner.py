from __future__ import annotations

import unittest

from scribe_nlp.ner import extract_entities


class NerTests(unittest.TestCase):
    def test_detects_wiki_links_and_hashtags(self) -> None:
        text = "Pozri [[Projekt Scribe|Scribe]] a #journal poznámku."
        result = extract_entities(text)
        kinds = {item["kind"] for item in result["entities"]}
        self.assertIn("wiki_link", kinds)
        self.assertIn("hashtag", kinds)
        self.assertIn("projekt-scribe", result["tagSuggestions"])

    def test_detects_email_and_url(self) -> None:
        text = "Kontakt: info@example.com a https://example.com/docs"
        result = extract_entities(text)
        kinds = {item["kind"] for item in result["entities"]}
        self.assertIn("email", kinds)
        self.assertIn("url", kinds)
        self.assertIn("kontakt", result["tagSuggestions"])
        self.assertIn("odkaz", result["tagSuggestions"])

    def test_deduplicates_tag_suggestions(self) -> None:
        text = "#Projekt #projekt [[Projekt]]"
        result = extract_entities(text)
        lowered = [item.lower() for item in result["tagSuggestions"]]
        self.assertEqual(len(lowered), len(set(lowered)))


if __name__ == "__main__":
    unittest.main()
