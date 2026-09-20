from __future__ import annotations

import unittest
from datetime import date

from scribe_nlp.dates import extract_dates_batch
from scribe_nlp.organize import suggest_organize
from scribe_nlp.server import handle_request
from scribe_nlp.wiki_suggest import suggest_wiki_links


class WikiSuggestTests(unittest.TestCase):
    def test_matches_title_phrase(self) -> None:
        result = suggest_wiki_links(
            "Meeting about Project Atlas tomorrow with the team.",
            [
                {"id": "1", "title": "Project Atlas"},
                {"id": "2", "title": "Grocery list"},
            ],
            exclude_document_id="9",
        )
        titles = [item["title"] for item in result["suggestions"]]
        self.assertIn("Project Atlas", titles)

    def test_skips_existing_wiki_link(self) -> None:
        result = suggest_wiki_links(
            "See [[Project Atlas]] for details about Project Atlas.",
            [{"id": "1", "title": "Project Atlas"}],
        )
        self.assertEqual(result["count"], 0)


class OrganizeTests(unittest.TestCase):
    def test_prefers_matching_folder(self) -> None:
        result = suggest_organize(
            "Notes from the client work project kickoff",
            [
                {"id": "a", "name": "Personal"},
                {"id": "b", "name": "Work"},
                {"id": "c", "name": "Travel"},
            ],
            tags=["work", "client"],
            current_folder_id=None,
        )
        self.assertFalse(result["createNew"])
        self.assertEqual(result["bestFolderId"], "b")
        self.assertEqual(result["bestFolderName"], "Work")
        self.assertGreaterEqual(result["count"], 1)
        self.assertEqual(result["suggestions"][0]["folderId"], "b")

    def test_proposes_new_folder_when_none_exist(self) -> None:
        result = suggest_organize(
            "Travel itinerary for Japan next month",
            [],
            tags=["travel"],
        )
        self.assertTrue(result["createNew"])
        self.assertIsNone(result["bestFolderId"])
        self.assertIsNotNone(result["bestFolderName"])


class CalendarBatchTests(unittest.TestCase):
    def test_aggregates_dates_across_docs(self) -> None:
        result = extract_dates_batch(
            [
                {
                    "id": "1",
                    "title": "Plan",
                    "text": "Deadline do 15.3.2026 for the release.",
                },
                {
                    "id": "2",
                    "title": "Meetup",
                    "text": "Call zajtra about scope.",
                },
            ],
            today=date(2026, 9, 12),
        )
        self.assertGreaterEqual(result["count"], 2)
        resolved = {item.get("resolvedDate") for item in result["events"]}
        self.assertIn("2026-03-15", resolved)
        self.assertIn("2026-09-13", resolved)


class ServerRpcTests(unittest.TestCase):
    def test_new_methods_and_version(self) -> None:
        health = handle_request(
            {"jsonrpc": "2.0", "id": 1, "method": "health", "params": {}}
        )["result"]
        self.assertEqual(health["version"], "1.0.0")
        for feature in ("wikiSuggest", "organize", "calendarEvents", "answerFollowups", "passageRerank"):
            self.assertIn(feature, health["features"])

        wiki = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "suggest_wiki_links",
                "params": {
                    "text": "Open Project Atlas notes",
                    "documents": [{"id": "1", "title": "Project Atlas"}],
                },
            }
        )
        self.assertNotIn("error", wiki)

        organize = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "suggest_organize",
                "params": {
                    "text": "travel itinerary",
                    "folders": [{"id": "t", "name": "Travel"}],
                    "tags": ["travel"],
                },
            }
        )
        self.assertNotIn("error", organize)
        self.assertEqual(organize["result"]["bestFolderName"], "Travel")


if __name__ == "__main__":
    unittest.main()
