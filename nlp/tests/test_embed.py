from __future__ import annotations

import unittest

from scribe_nlp.embed import MODEL_ID, embed_batch, embed_text
from scribe_nlp.text_utils import jaccard_similarity


class EmbedTests(unittest.TestCase):
    def test_model_id_is_v4(self) -> None:
        self.assertEqual(MODEL_ID, "scribe-hash-v4")

    def test_empty_text_returns_zero_vector(self) -> None:
        vector = embed_text("")
        self.assertEqual(len(vector), 384)
        self.assertEqual(sum(vector), 0.0)

    def test_similar_texts_have_higher_similarity(self) -> None:
        left = embed_text("Projekt Scribe a lokálne vyhľadávanie poznámok")
        right = embed_text("Scribe projekt pre lokálne poznámky")
        unrelated = embed_text("Recept na paradajkovú polievku s bazalkou")

        def cosine(a: list[float], b: list[float]) -> float:
            dot = sum(x * y for x, y in zip(a, b))
            norm_a = sum(x * x for x in a) ** 0.5
            norm_b = sum(y * y for y in b) ** 0.5
            return dot / (norm_a * norm_b)

        self.assertGreater(cosine(left, right), cosine(left, unrelated))

    def test_embed_batch_matches_single_calls(self) -> None:
        texts = ["Prvá veta", "Druhá veta"]
        batch = embed_batch(texts)
        self.assertEqual(len(batch), 2)
        self.assertEqual(batch[0], embed_text(texts[0]))
        self.assertEqual(batch[1], embed_text(texts[1]))

    def test_embed_batch_handles_long_docs_without_crash(self) -> None:
        long = ("poznámka " * 400).strip()
        self.assertGreaterEqual(len(long), 1_600)
        vectors = embed_batch([long, "krátky text"])
        self.assertEqual(len(vectors), 2)
        self.assertEqual(len(vectors[0]), 384)
        self.assertEqual(len(vectors[1]), 384)


class TextUtilsTests(unittest.TestCase):
    def test_jaccard_detects_overlap(self) -> None:
        self.assertGreater(
            jaccard_similarity("Projekt Scribe je lokálny", "Lokálny projekt Scribe"),
            jaccard_similarity("Projekt Scribe je lokálny", "Polievka a chlieb"),
        )


if __name__ == "__main__":
    unittest.main()
