from __future__ import annotations

import json
import unittest

from scribe_nlp.report import library_report
from scribe_nlp.server import handle_request


class ReportTests(unittest.TestCase):
    def test_sorts_recent_titles_by_updated_at(self) -> None:
        documents = [
            {
                "title": "Starý",
                "text": "text",
                "tags": [],
                "updatedAt": 10,
                "folderId": "folder-a",
            },
            {
                "title": "Nový",
                "text": "text",
                "tags": ["journal"],
                "updatedAt": 99,
                "folderId": None,
            },
        ]
        folders = [
            {"id": "folder-a", "name": "Denník", "parentId": None, "isVault": False},
            {"id": "folder-b", "name": "Archív", "parentId": None, "isVault": True},
        ]
        result = library_report(documents, folders)
        self.assertIn("Nový", result["markdown"])
        self.assertIn("Bez tagov", result["markdown"])
        self.assertIn("## Dokumentácia", result["markdown"])
        self.assertIn("Denník", result["markdown"])
        self.assertIn("Archív", result["markdown"])
        self.assertIn("Koreň knižnice", result["markdown"])
        docs = result["stats"]["documentation"]
        names = {row["name"] for row in docs}
        self.assertIn("Denník", names)
        self.assertIn("Archív", names)
        dennik = next(row for row in docs if row["name"] == "Denník")
        self.assertEqual(dennik["documentCount"], 1)
        self.assertTrue(next(row for row in docs if row["name"] == "Archív")["isVault"])


class ServerTests(unittest.TestCase):
    def test_health_includes_limits(self) -> None:
        response = handle_request(
            {"jsonrpc": "2.0", "id": 1, "method": "health", "params": {}}
        )
        result = response["result"]
        self.assertTrue(result["ok"])
        self.assertEqual(result["model"], "scribe-hash-v4")
        self.assertIn("limits", result)
        self.assertIn("embedBackend", result)
        self.assertIn("qualityAvailable", result)

    def test_extract_tasks_method(self) -> None:
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "extract_tasks",
                "params": {"text": "- [ ] Finish notes\nTreba: review PR"},
            }
        )
        result = response["result"]
        self.assertIn("tasks", result)
        self.assertGreaterEqual(len(result["tasks"]), 1)

    def test_set_embed_backend(self) -> None:
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 5,
                "method": "set_embed_backend",
                "params": {"backend": "hash"},
            }
        )
        self.assertNotIn("error", response)
        health = handle_request(
            {"jsonrpc": "2.0", "id": 6, "method": "health", "params": {}}
        )["result"]
        self.assertEqual(health["embedBackend"], "hash")

    def test_rejects_oversized_batch(self) -> None:
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "embed_batch",
                "params": {"texts": ["x"] * 200},
            }
        )
        self.assertIn("error", response)
        self.assertEqual(response["error"]["code"], -32602)

    def test_unknown_method(self) -> None:
        response = handle_request(
            {"jsonrpc": "2.0", "id": 3, "method": "nope", "params": {}}
        )
        self.assertEqual(response["error"]["code"], -32601)


if __name__ == "__main__":
    unittest.main()
