from __future__ import annotations

import unittest
from datetime import date

from scribe_nlp.dates import resolve_due_hint
from scribe_nlp.embed import embed_batch_with_chunks, embed_with_chunks
from scribe_nlp.library_answer import library_answer
from scribe_nlp.server import handle_request


class DueHintTests(unittest.TestCase):
    def test_resolve_due_hint_deadline(self) -> None:
        today = date(2026, 9, 12)
        self.assertEqual(
            resolve_due_hint("Ship release do 15.3.2026", today=today),
            "2026-03-15",
        )
        self.assertEqual(
            resolve_due_hint("Meeting zajtra", today=today),
            "2026-09-13",
        )

    def test_resolve_due_hints_rpc(self) -> None:
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "resolve_due_hints",
                "params": {
                    "texts": ["deadline do 2026-10-01", "no date here"],
                    "today": "2026-09-12",
                },
            }
        )
        self.assertNotIn("error", response)
        hints = response["result"]["hints"]
        self.assertEqual(hints[0], "2026-10-01")
        self.assertIsNone(hints[1])


class LibraryAnswerTests(unittest.TestCase):
    def test_extractive_answer_with_citations(self) -> None:
        result = library_answer(
            "What about embeddings?",
            [
                {
                    "documentId": "d1",
                    "title": "Search notes",
                    "snippet": "Local embeddings power semantic search in Scribe. Hybrid mode fuses FTS.",
                },
                {
                    "documentId": "d2",
                    "title": "Other",
                    "snippet": "Grocery list: milk and bread.",
                },
            ],
        )
        self.assertIn("embeddings", result["answer"].lower())
        self.assertEqual(result["citations"][0]["documentId"], "d1")

    def test_library_answer_rpc(self) -> None:
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "library_answer",
                "params": {
                    "question": "deadlines",
                    "passages": [
                        {
                            "documentId": "a",
                            "title": "Tasks",
                            "snippet": "Finish the report. The deadline is next week.",
                        }
                    ],
                },
            }
        )
        self.assertNotIn("error", response)
        self.assertIn("answer", response["result"])
        self.assertIn("libraryAnswer", handle_request(
            {"jsonrpc": "2.0", "id": 3, "method": "health", "params": {}}
        )["result"]["features"])


class ChunkEmbedTests(unittest.TestCase):
    def test_embed_with_chunks_short(self) -> None:
        result = embed_with_chunks("Short note about Scribe.")
        self.assertEqual(len(result["chunks"]), 1)
        self.assertEqual(len(result["vector"]), 384)

    def test_embed_batch_with_chunks_long(self) -> None:
        long = " ".join([f"Veta číslo {index} o projekte a deadlineoch." for index in range(120)])
        result = embed_batch_with_chunks([long, "krátky text"])
        self.assertEqual(len(result["documents"]), 2)
        self.assertGreater(len(result["documents"][0]["chunks"]), 1)
        self.assertEqual(len(result["documents"][1]["chunks"]), 1)

    def test_embed_with_chunks_rpc(self) -> None:
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "embed_with_chunks",
                "params": {"text": "Chunk embedding test note."},
            }
        )
        self.assertNotIn("error", response)
        self.assertIn("chunks", response["result"])
        self.assertIn("vector", response["result"])


class VersionTests(unittest.TestCase):
    def test_health_version(self) -> None:
        result = handle_request(
            {"jsonrpc": "2.0", "id": 9, "method": "health", "params": {}}
        )["result"]
        self.assertEqual(result["version"], "0.9.0")
        for feature in ("chunkEmbeddings", "libraryAnswer", "dueHints"):
            self.assertIn(feature, result["features"])


if __name__ == "__main__":
    unittest.main()
