from __future__ import annotations

import unittest

from scribe_nlp.server import FEATURES, handle_request
from scribe_nlp import __version__


def rpc(method: str, params: dict | None = None, request_id: int = 1) -> dict:
    return handle_request(
        {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params or {},
        }
    )


class RpcCoverageTests(unittest.TestCase):
    def test_health_lists_every_feature(self) -> None:
        result = rpc("health")["result"]
        self.assertEqual(result["version"], __version__)
        for feature in FEATURES:
            self.assertIn(feature, result["features"], feature)
        for expected in (
            "embed",
            "similar",
            "analyze",
            "report",
            "libraryAnswer",
            "wikiSuggest",
            "organize",
        ):
            self.assertIn(expected, result["features"])

    def test_embed_returns_unit_vector(self) -> None:
        response = rpc("embed", {"text": "Local Scribe notes"})
        self.assertNotIn("error", response)
        vector = response["result"]["vector"]
        self.assertEqual(len(vector), 384)
        self.assertEqual(response["result"]["dims"], 384)
        self.assertAlmostEqual(sum(value * value for value in vector), 1.0, places=5)

    def test_embed_batch_matches_single_embed(self) -> None:
        texts = ["First note about search", "Second note about soup"]
        batch = rpc("embed_batch", {"texts": texts}, request_id=2)
        self.assertNotIn("error", batch)
        vectors = batch["result"]["vectors"]
        self.assertEqual(len(vectors), 2)
        first = rpc("embed", {"text": texts[0]}, request_id=3)["result"]["vector"]
        self.assertEqual(vectors[0], first)

    def test_similar_notes_ranks_related_document(self) -> None:
        response = rpc(
            "similar_notes",
            {
                "text": "Local embeddings power semantic search",
                "documents": [
                    {
                        "id": "1",
                        "title": "Search",
                        "text": "Local embeddings power semantic search in Scribe.",
                    },
                    {
                        "id": "2",
                        "title": "Soup",
                        "text": "Tomato soup recipe with basil and garlic.",
                    },
                ],
                "limit": 2,
            },
        )
        self.assertNotIn("error", response)
        matches = response["result"]["matches"]
        self.assertGreaterEqual(len(matches), 1)
        self.assertEqual(matches[0]["id"], "1")

    def test_library_report_rpc(self) -> None:
        response = rpc(
            "library_report",
            {
                "documents": [
                    {
                        "id": "1",
                        "title": "Search notes",
                        "text": "Local embeddings power semantic search in Scribe.",
                        "tags": ["nlp"],
                        "updatedAt": 20,
                        "folderId": "f1",
                    },
                    {
                        "id": "2",
                        "title": "Grocery",
                        "text": "Milk and bread.",
                        "tags": [],
                        "updatedAt": 10,
                        "folderId": None,
                    },
                ],
                "folders": [{"id": "f1", "name": "Work", "parentId": None, "isVault": False}],
            },
        )
        self.assertNotIn("error", response)
        result = response["result"]
        self.assertIn("Analýza knižnice", result["markdown"])
        self.assertEqual(result["stats"]["documentCount"], 2)
        self.assertEqual(result["stats"]["taggedCount"], 1)
        folder_names = {row["name"] for row in result["stats"]["documentation"]}
        self.assertIn("Work", folder_names)

    def test_library_answer_rpc_prefix(self) -> None:
        response = rpc(
            "library_answer",
            {
                "question": "What about embeddings?",
                "passages": [
                    {
                        "documentId": "d1",
                        "title": "Search notes",
                        "snippet": "Local embeddings power semantic search in Scribe.",
                    }
                ],
                "scope": "library",
            },
        )
        self.assertNotIn("error", response)
        self.assertTrue(response["result"]["answer"].startswith("Based on your notes"))
        self.assertEqual(response["result"]["citations"][0]["documentId"], "d1")

    def test_analyze_short_text_rpc_omits_summary(self) -> None:
        response = rpc("analyze_document", {"text": "Hi."})
        self.assertNotIn("error", response)
        self.assertIsNone(response["result"]["summary"])


if __name__ == "__main__":
    unittest.main()
