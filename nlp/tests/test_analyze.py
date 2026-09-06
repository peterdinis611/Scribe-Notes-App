from __future__ import annotations

import unittest

from scribe_nlp.analyze import analyze_document
from scribe_nlp.server import handle_request
from scribe_nlp.similar import similar_notes


class AnalyzeTests(unittest.TestCase):
    def test_analyze_returns_core_fields(self) -> None:
        text = (
            "# Projekt Scribe\n\n"
            "Lokálna AI pomáha so zhrnutím poznámok a kľúčovými slovami. "
            "Druhá veta rozvíja tému vyhľadávania. "
            "Treťia veta spomína denník a tagy. "
            "Štvrtá veta uzatvára odsek o súkromí dát."
        )
        result = analyze_document(text)
        self.assertEqual(result["language"], "sk")
        self.assertGreater(len(result["keywords"]), 0)
        self.assertTrue(result.get("summary"))
        self.assertIn("outline", result)

    def test_analyze_document_rpc(self) -> None:
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 10,
                "method": "analyze_document",
                "params": {
                    "text": (
                        "Scribe uses local NLP for notes. "
                        "Keywords and language detection stay on device. "
                        "Embeddings power semantic search without cloud APIs."
                    )
                },
            }
        )
        self.assertNotIn("error", response)
        result = response["result"]
        self.assertIn(result["language"], {"en", "unknown", "sk"})
        self.assertIn("keywords", result)
        self.assertIn("analyze", handle_request(
            {"jsonrpc": "2.0", "id": 11, "method": "health", "params": {}}
        )["result"]["features"])


class SimilarNotesTests(unittest.TestCase):
    def test_similar_prefers_related_note(self) -> None:
        documents = [
            {
                "id": "1",
                "title": "Scribe NLP",
                "text": "Lokálne embeddings a sémantické vyhľadávanie poznámok",
            },
            {
                "id": "2",
                "title": "Polievka",
                "text": "Recept na paradajkovú polievku s bazalkou a cesnakom",
            },
        ]
        result = similar_notes(
            "Sémantické vyhľadávanie v Scribe",
            documents,
            limit=2,
        )
        matches = result["matches"]
        self.assertGreaterEqual(len(matches), 1)
        self.assertEqual(matches[0]["id"], "1")


if __name__ == "__main__":
    unittest.main()
