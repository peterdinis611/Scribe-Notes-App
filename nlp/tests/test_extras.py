from __future__ import annotations

import unittest

from scribe_nlp.extras import extras_status, fix_unicode, fuzzy_ratio, fuzzy_extract
from scribe_nlp.server import handle_request


class TestExtrasSoftImport(unittest.TestCase):
    def test_extras_status_keys(self) -> None:
        status = extras_status()
        for key in (
            "rapidfuzz",
            "lingua",
            "ftfy",
            "dateparser",
            "argosTranslate",
            "spacy",
            "onnxruntime",
            "faiss",
            "model2vec",
            "bm25s",
            "pynear",
            "sentenceTransformers",
        ):
            self.assertIn(key, status)
            self.assertIsInstance(status[key], bool)

    def test_fuzzy_fallback_without_crash(self) -> None:
        self.assertEqual(fuzzy_ratio("hello", "hello"), 1.0)
        self.assertGreater(fuzzy_ratio("Bratislava notes", "Bratislava"), 0.4)
        hits = fuzzy_extract("proj", ["Project Alpha", "Other"], limit=2, score_cutoff=0.3)
        self.assertTrue(hits)

    def test_fix_unicode_passthrough(self) -> None:
        self.assertEqual(fix_unicode("Ahoj"), "Ahoj")

    def test_health_includes_extras(self) -> None:
        response = handle_request({"id": 1, "method": "health", "params": {}})
        result = response["result"]
        self.assertIn("extras", result)
        self.assertIn("features", result)
        self.assertIn("onnxAvailable", result)
        self.assertIn("faissAvailable", result)


if __name__ == "__main__":
    unittest.main()
