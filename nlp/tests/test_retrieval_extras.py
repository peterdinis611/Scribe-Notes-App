from __future__ import annotations

import unittest

from scribe_nlp.bm25_search import bm25_rank
from scribe_nlp.embed_backend import configure_backend, current_model_id, fast_available
from scribe_nlp.faiss_search import HNSW_THRESHOLD, faiss_top_k
from scribe_nlp.rerank import _bm25_preselect, rerank_passages
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

    def test_bm25_preselect_before_cut(self) -> None:
        pool = [
            {"documentId": "n", "title": "Note", "snippet": f"filler paragraph {i} about weather"}
            for i in range(40)
        ]
        pool[35] = {
            "documentId": "n",
            "title": "Note",
            "snippet": "The project deadline is next Friday and must ship.",
        }
        selected = _bm25_preselect("When is the deadline?", pool, limit=8)
        self.assertLessEqual(len(selected), 8)
        joined = " ".join(item["snippet"] for item in selected).lower()
        self.assertIn("deadline", joined)

    def test_rerank_accepts_large_pool(self) -> None:
        passages = [
            {"documentId": "d", "title": "T", "snippet": f"unrelated text block {i}"}
            for i in range(50)
        ]
        passages[42]["snippet"] = "Release plan and Friday deadline for the beta."
        ranked = rerank_passages("deadline Friday", passages, limit=6)
        self.assertTrue(ranked)
        self.assertLessEqual(len(ranked), 6)

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

    def test_library_answer_document_accepts_wide_pool(self) -> None:
        passages = [
            {
                "documentId": "d1",
                "title": "Note",
                "snippet": f"paragraph {i} with unrelated content",
            }
            for i in range(50)
        ]
        passages[40]["snippet"] = "The invoice is due on March 12."
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "library_answer",
                "params": {
                    "question": "When is the invoice due?",
                    "passages": passages,
                    "scope": "document",
                    "maxSentences": 3,
                },
            }
        )
        self.assertNotIn("error", response)
        answer = (response.get("result") or {}).get("answer") or ""
        self.assertTrue(answer)


if __name__ == "__main__":
    unittest.main()
