from __future__ import annotations

import unittest
from datetime import date

from scribe_nlp.dates import resolve_due_hint
from scribe_nlp.embed import embed_batch_with_chunks, embed_with_chunks
from scribe_nlp.library_answer import library_answer
from scribe_nlp.server import handle_request
from scribe_nlp import __version__


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
                    "chunkIndex": 2,
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
        self.assertEqual(result["citations"][0]["chunkIndex"], 2)
        self.assertGreaterEqual(len(result.get("followups") or []), 1)
        self.assertTrue(result["answer"].startswith("Based on your notes"))

    def test_document_scope_uses_document_prefix(self) -> None:
        result = library_answer(
            "What about embeddings?",
            [
                {
                    "documentId": "d1",
                    "title": "Search notes",
                    "snippet": "Local embeddings power semantic search in Scribe.",
                }
            ],
            scope="document",
        )
        self.assertTrue(result["answer"].startswith("Based on this document"))

    def test_empty_question_returns_fallback(self) -> None:
        result = library_answer("", [])
        self.assertIn("No matching passages were found", result["answer"])
        self.assertEqual(result["citations"], [])

    def test_skips_table_noise_in_extractive_answer(self) -> None:
        result = library_answer(
            "What about embeddings?",
            [
                {
                    "documentId": "d1",
                    "title": "Tables",
                    "snippet": "| col | val |\n| --- | --- |\n| 12 | 34 | 56 | 78 |",
                },
                {
                    "documentId": "d2",
                    "title": "Search notes",
                    "snippet": "Local embeddings power semantic search in Scribe.",
                },
            ],
        )
        self.assertIn("embeddings", result["answer"].lower())
        self.assertNotIn("| col |", result["answer"])
        self.assertEqual(result["citations"][0]["documentId"], "d2")

    def test_stem_aware_matching(self) -> None:
        result = library_answer(
            "projects",
            [
                {
                    "documentId": "d1",
                    "title": "Work",
                    "snippet": "The project ships next month with new features.",
                }
            ],
        )
        self.assertIn("project", result["answer"].lower())

    def test_chat_memory_passages_can_answer_followups(self) -> None:
        result = library_answer(
            "what was the deadline",
            [
                {
                    "documentId": "d1",
                    "title": "Guide",
                    "snippet": "Tables are editable. Use the command palette.",
                },
                {
                    "documentId": "d1",
                    "title": "Guide · chat memory",
                    "snippet": "Earlier user question: When is the deadline?",
                },
                {
                    "documentId": "d1",
                    "title": "Guide · chat memory",
                    "snippet": "Earlier assistant reply: The deadline is Friday.",
                },
            ],
            scope="document",
        )
        self.assertIn("friday", result["answer"].lower())
        self.assertGreaterEqual(len(result.get("followups") or []), 1)

    def test_intent_boosts_deadline_sentences(self) -> None:
        from scribe_nlp.library_answer import detect_question_intent, library_answer

        self.assertEqual(detect_question_intent("Any deadlines or dates in my notes?"), "dates")
        result = library_answer(
            "Any deadlines or dates in my notes?",
            [
                {
                    "documentId": "a",
                    "title": "Groceries",
                    "snippet": "Milk and bread for the weekend picnic.",
                },
                {
                    "documentId": "b",
                    "title": "Release",
                    "snippet": "Ship the release. The deadline is 2026-10-01.",
                },
            ],
        )
        self.assertEqual(result.get("intent"), "dates")
        self.assertIn("deadline", result["answer"].lower())
        self.assertIn("Dates & deadlines", result["answer"])
        self.assertGreaterEqual(len(result.get("followups") or []), 2)

    def test_people_and_decisions_intents(self) -> None:
        from scribe_nlp.library_answer import detect_question_intent

        self.assertEqual(detect_question_intent("Who do I mention across my notes?"), "people")
        self.assertEqual(
            detect_question_intent("Aké rozhodnutia alebo závery som si zaznačil?"),
            "decisions",
        )

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

    def test_rerank_puts_relevant_passage_first(self) -> None:
        from scribe_nlp.rerank import rerank_passages

        ranked = rerank_passages(
            "semantic embeddings for search",
            [
                {"documentId": "g", "title": "Groceries", "snippet": "Milk, bread, apples."},
                {
                    "documentId": "s",
                    "title": "Search",
                    "snippet": "Local embeddings power semantic search in Scribe.",
                },
            ],
        )
        self.assertEqual(ranked[0]["documentId"], "s")
        self.assertGreater(float(ranked[0]["score"]), float(ranked[1]["score"]))


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
        self.assertEqual(result["version"], __version__)
        for feature in ("chunkEmbeddings", "libraryAnswer", "dueHints"):
            self.assertIn(feature, result["features"])


if __name__ == "__main__":
    unittest.main()
