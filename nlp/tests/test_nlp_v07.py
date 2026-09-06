from __future__ import annotations

import unittest

from scribe_nlp.chunking import chunk_text
from scribe_nlp.normalize import fold_diacritics, stem_lite
from scribe_nlp.ner import extract_entities
from scribe_nlp.query_rewrite import rewrite_query
from scribe_nlp.server import handle_request
from scribe_nlp.text_utils import content_stems, jaccard_similarity


class NormalizeTests(unittest.TestCase):
    def test_diacritic_fold_matches(self) -> None:
        self.assertEqual(fold_diacritics("písanie"), fold_diacritics("pisanie"))
        self.assertEqual(stem_lite("poznámky"), stem_lite("poznamka"))

    def test_jaccard_ignores_diacritics_via_stems(self) -> None:
        score = jaccard_similarity(
            "Písanie poznámok v Scribe",
            "Pisanie poznamok v Scribe",
        )
        self.assertGreater(score, 0.7)


class ChunkTests(unittest.TestCase):
    def test_chunks_long_text(self) -> None:
        text = " ".join([f"Veta číslo {index} o projekte Scribe." for index in range(80)])
        chunks = chunk_text(text, max_chars=200, overlap=40, max_chunks=10)
        self.assertGreater(len(chunks), 1)
        self.assertLessEqual(len(chunks), 10)


class QueryRewriteTests(unittest.TestCase):
    def test_expands_note_synonym(self) -> None:
        result = rewrite_query("hľadám poznámku o projekte")
        joined = " ".join(result["expansions"]).lower()
        self.assertTrue("note" in joined or "notes" in result["rewritten"].lower())


class NerTests(unittest.TestCase):
    def test_company_and_place(self) -> None:
        text = "Schôdza s Acme s.r.o. v Bratislave. Pozri [[Peter Novák]]."
        result = extract_entities(text)
        kinds = {item["kind"] for item in result["entities"]}
        self.assertIn("org", kinds)
        self.assertIn("place", kinds)
        self.assertTrue(any(item["kind"] in {"wiki_link", "person"} for item in result["entities"]))


class ServerV07Tests(unittest.TestCase):
    def test_health_version_and_features(self) -> None:
        result = handle_request(
            {"jsonrpc": "2.0", "id": 1, "method": "health", "params": {}}
        )["result"]
        self.assertEqual(result["version"], "0.7.0")
        self.assertEqual(result["model"], "scribe-hash-v4")
        for feature in ("chunking", "queryRewrite", "stemming"):
            self.assertIn(feature, result["features"])

    def test_rewrite_query_rpc(self) -> None:
        response = handle_request(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "rewrite_query",
                "params": {"query": "task deadline"},
            }
        )
        self.assertNotIn("error", response)
        self.assertIn("rewritten", response["result"])


if __name__ == "__main__":
    unittest.main()
