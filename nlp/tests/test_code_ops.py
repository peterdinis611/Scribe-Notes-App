import json
import unittest

from scribe_nlp.code_ops import language_from_extension, source_text_to_tiptap, source_to_tiptap
from scribe_nlp.server import handle_request


def rpc(method: str, params: dict | None = None) -> dict:
    return handle_request(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    )


class CodeOpsTests(unittest.TestCase):
    def test_language_map(self) -> None:
        self.assertEqual(language_from_extension("rs"), "rust")
        self.assertEqual(language_from_extension("tsx"), "typescript")
        self.assertIsNone(language_from_extension("png"))

    def test_source_to_tiptap(self) -> None:
        doc = source_text_to_tiptap("print('hi')", "python")
        self.assertEqual(doc["content"][0]["type"], "codeBlock")
        self.assertEqual(doc["content"][0]["attrs"]["language"], "python")

    def test_rpc(self) -> None:
        health = rpc("health")["result"]
        self.assertIn("sourceToTiptap", health["features"])
        out = rpc("source_to_tiptap", {"text": "fn main() {}", "language": "rust"})
        self.assertNotIn("error", out)
        tip = json.loads(out["result"]["contentJson"])
        self.assertEqual(tip["content"][0]["attrs"]["language"], "rust")


if __name__ == "__main__":
    unittest.main()
