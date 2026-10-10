from __future__ import annotations

import unittest

from scribe_nlp.server import handle_request


class PassageRerankFollowupsTests(unittest.TestCase):
    def test_passage_rerank(self) -> None:
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "passage_rerank",
                "params": {
                    "query": "meeting notes",
                    "passages": [
                        {"title": "Meeting notes", "text": "Agenda and decisions"},
                        {"title": "Grocery", "text": "Milk and bread"},
                    ],
                    "limit": 2,
                },
            }
        )
        self.assertNotIn("error", response)
        result = response["result"]
        self.assertEqual(result["count"], 2)
        self.assertEqual(len(result["passages"]), 2)

    def test_answer_followups(self) -> None:
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "answer_followups",
                "params": {
                    "question": "What is the plan?",
                    "sentences": ["We ship because the deadline is Friday."],
                    "passages": [{"title": "Sprint plan", "snippet": "Ship Friday"}],
                    "scope": "document",
                    "limit": 4,
                },
            }
        )
        self.assertNotIn("error", response)
        followups = response["result"]["followups"]
        self.assertGreaterEqual(len(followups), 1)
        self.assertLessEqual(len(followups), 4)


if __name__ == "__main__":
    unittest.main()
