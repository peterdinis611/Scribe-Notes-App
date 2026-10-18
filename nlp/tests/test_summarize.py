from __future__ import annotations

import unittest

from scribe_nlp.summarize import summarize_text
from scribe_nlp.text_utils import content_tokens, split_sentences


class SummarizeTests(unittest.TestCase):
    def test_empty_text(self) -> None:
        result = summarize_text("")
        self.assertEqual(result["summary"], "")
        self.assertEqual(result["bullets"], [])

    def test_short_text_returns_all_sentences(self) -> None:
        text = "Prvá veta. Druhá veta."
        result = summarize_text(text, max_sentences=4)
        self.assertEqual(result["bullets"], ["Prvá veta.", "Druhá veta."])

    def test_long_text_picks_diverse_sentences(self) -> None:
        text = (
            "Scribe je lokálna aplikácia na poznámky. "
            "Podporuje wiki odkazy a export do viacerých formátov. "
            "Scribe je lokálna aplikácia na poznámky. "
            "Journal zobrazuje denné zápisky podľa dátumu. "
            "NLP beží cez Python sidecar bez cloudu."
        )
        result = summarize_text(text, max_sentences=3)
        bullets = result["bullets"]
        self.assertEqual(len(bullets), 3)
        self.assertEqual(bullets, sorted(bullets, key=text.index))

    def test_journal_newlines_without_punctuation(self) -> None:
        text = "Dokončiť report\nZavolať Petrovi\nPripraviť slides na meeting"
        parts = split_sentences(text)
        self.assertGreaterEqual(len(parts), 3)
        result = summarize_text(text, max_sentences=3)
        self.assertGreaterEqual(len(result["bullets"]), 2)

    def test_journal_time_stopwords_filtered(self) -> None:
        tokens = content_tokens("Dnes ráno som napísal report večer")
        self.assertNotIn("dnes", tokens)
        self.assertNotIn("ráno", tokens)
        self.assertNotIn("večer", tokens)
        self.assertIn("napísal", tokens)
        self.assertIn("report", tokens)


if __name__ == "__main__":
    unittest.main()
