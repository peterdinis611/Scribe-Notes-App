from __future__ import annotations

import unittest

from scribe_nlp.bm25_search import bm25_rank
from scribe_nlp.embed_backend import configure_backend, current_model_id, fast_available
from scribe_nlp.faiss_search import HNSW_THRESHOLD, faiss_top_k
from scribe_nlp.server import handle_request


class TestRetrievalExtras(unittest.TestCase):
    def test_bm25_rank_fallback(self) -> None:
        hits = bm25_rank(
            "cat purr",
            [
                "a cat likes to purr quietly",
                "dogs like to play outside",
                "birds can fly high",
            ],
            limit=2,
        )
        self.assertTrue(hits)
        self.assertEqual(hits[0][0], 0)
        self.assertGreater(hits[0][1], 0)

    def test_faiss_top_k_empty_without_deps(self) -> None:
        # Soft: returns [] when neither faiss nor pynear is installed / usable.
        query = [1.0, 0.0, 0.0]
        vectors = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
        hits = faiss_top_k(query, vectors, limit=1)
        self.assertIsInstance(hits, list)

    def test_hnsw_threshold_constant(self) -> None:
        self.assertGreaterEqual(HNSW_THRESHOLD, 64)

    def test_configure_fast_falls_back_without_model2vec(self) -> None:
        configured = configure_backend("fast")
        if fast_available():
            self.assertEqual(configured, "fast")
            self.assertEqual(current_model_id(), "scribe-m2v-v1")
        else:
            self.assertEqual(configured, "hash")

    def test_health_reports_new_flags(self) -> None:
        response = handle_request({"id": 1, "method": "health", "params": {}})
        result = response["result"]
        self.assertIn("fastAvailable", result)
        self.assertIn("bm25Available", result)
        self.assertIn("hnswAvailable", result)
        self.assertIn("model2vec", result["extras"])
        self.assertIn("bm25s", result["extras"])
        self.assertIn("pynear", result["extras"])


if __name__ == "__main__":
    unittest.main()
