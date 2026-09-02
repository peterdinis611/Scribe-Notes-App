from __future__ import annotations

import unittest

from scribe_nlp.summarize import summarize_text


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


if __name__ == "__main__":
    unittest.main()
