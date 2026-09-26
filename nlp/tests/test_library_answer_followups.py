from __future__ import annotations

import unittest

from scribe_nlp.bm25_search import bm25_rank
from scribe_nlp.library_answer import detect_question_intent, library_answer, suggest_followups
from scribe_nlp.rerank import rerank_passages
from scribe_nlp.server import handle_request


class TestLibraryAnswerFollowups(unittest.TestCase):
    def test_detect_intent_deadline(self) -> None:
        self.assertEqual(detect_question_intent("What is the deadline?"), "dates")
        self.assertIsNone(detect_question_intent("   "))

    def test_detect_intent_people(self) -> None:
        self.assertEqual(detect_question_intent("Who is mentioned in this note?"), "people")

    def test_followups_for_document_scope(self) -> None:
        passages = [
            {
                "documentId": "d1",
                "title": "Launch",
                "snippet": "Ship the beta on Friday. Marketing needs screenshots.",
            }
        ]
        followups = suggest_followups(
            "When do we ship?",
            ["Ship the beta on Friday."],
            passages,
            scope="document",
            intent="date",
        )
        self.assertIsInstance(followups, list)
        self.assertLessEqual(len(followups), 6)
        self.assertTrue(all(isinstance(item, str) and item.strip() for item in followups))

    def test_document_answer_rpc_returns_citations(self) -> None:
        passages = [
            {
                "documentId": "note-1",
                "title": "Invoice",
                "snippet": "Payment is due on March 12 for vendor ACME.",
                "chunkIndex": 0,
            },
            {
                "documentId": "note-1",
                "title": "Invoice",
                "snippet": "Unrelated weather notes for the week.",
                "chunkIndex": 1,
            },
        ]
        response = handle_request(
            {
                "id": 1,
                "method": "library_answer",
                "params": {
                    "question": "When is payment due?",
                    "passages": passages,
                    "scope": "document",
                    "limit": 4,
                },
            }
        )
        self.assertNotIn("error", response)
        result = response.get("result") or {}
        self.assertTrue(result.get("answer"))
        citations = result.get("citations") or []
        self.assertTrue(citations)
        joined = " ".join(str(item.get("snippet", "")) for item in citations).lower()
        self.assertTrue("march" in joined or "due" in joined or "payment" in joined)

    def test_bm25_empty_query_is_safe(self) -> None:
        hits = bm25_rank("", ["alpha", "beta"], limit=3)
        self.assertEqual(hits, [])

    def test_rerank_empty_pool(self) -> None:
        self.assertEqual(rerank_passages("anything", [], limit=5), [])

    def test_library_answer_empty_passages(self) -> None:
        result = library_answer("What happened?", [])
        self.assertIsInstance(result, dict)
        self.assertIn("answer", result)
        self.assertIn("followups", result)
        self.assertEqual(result["citations"], [])
        self.assertIsInstance(result["answer"], str)
        self.assertTrue(result["answer"])


if __name__ == "__main__":
    unittest.main()
