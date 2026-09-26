from __future__ import annotations

import unittest

from scribe_nlp.continuation import suggest_continuation, tokenize


class ContinuationTests(unittest.TestCase):
    def test_tokenize(self) -> None:
        self.assertEqual(tokenize("Hello, world — poznámka."), ["Hello", "world", "poznámka"])

    def test_suggests_from_corpus_trigram(self) -> None:
        corpus = [
            "The project deadline is next Monday after review.",
            "The project deadline is next Friday for shipping.",
            "We discussed the project deadline in standup.",
        ]
        result = suggest_continuation(
            "The project deadline",
            corpus=corpus,
            max_suggestions=3,
            max_tokens=4,
        )
        self.assertEqual(result["source"], "python")
        self.assertGreaterEqual(len(result["suggestions"]), 1)
        top = result["suggestions"][0]["text"].lower()
        self.assertTrue(
            top.startswith("is") or "next" in top or "in" in top,
            msg=f"unexpected suggestion: {top}",
        )

    def test_empty_prefix_uses_corpus_unigrams(self) -> None:
        result = suggest_continuation(
            "",
            corpus=["alpha beta gamma alpha beta delta"],
            max_suggestions=2,
            max_tokens=3,
        )
        self.assertGreaterEqual(len(result["suggestions"]), 1)

    def test_no_corpus_returns_empty_or_prefix_only(self) -> None:
        result = suggest_continuation("alone", corpus=[], max_suggestions=2)
        self.assertEqual(result["source"], "python")
        self.assertIsInstance(result["suggestions"], list)


if __name__ == "__main__":
    unittest.main()
