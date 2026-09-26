from __future__ import annotations

import unittest

from scribe_nlp.placeholder import generate_placeholder


class PlaceholderTests(unittest.TestCase):
    def test_latin_paragraphs_start_with_classic(self) -> None:
        result = generate_placeholder(
            unit="paragraphs",
            count=2,
            language="la",
            start_with_classic=True,
            seed=11,
        )
        self.assertEqual(result["source"], "python")
        self.assertEqual(result["language"], "la")
        self.assertIn("lorem", result["text"].lower())

    def test_slovak_words_count(self) -> None:
        result = generate_placeholder(
            unit="words",
            count=12,
            language="sk",
            start_with_classic=False,
            seed=3,
        )
        self.assertEqual(result["count"], 12)
        self.assertEqual(len(result["text"].split()), 12)

    def test_english_sentences(self) -> None:
        result = generate_placeholder(
            unit="sentences",
            count=3,
            language="en",
            start_with_classic=False,
            seed=5,
        )
        self.assertEqual(result["text"].count("."), 3)


if __name__ == "__main__":
    unittest.main()
