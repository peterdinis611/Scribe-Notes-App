import json
import unittest

from scribe_nlp.code_ops import (
    code_brief,
    language_from_extension,
    source_text_to_tiptap,
)
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
        self.assertIn("codeBrief", health["features"])
        out = rpc("source_to_tiptap", {"text": "fn main() {}", "language": "rust"})
        self.assertNotIn("error", out)
        tip = json.loads(out["result"]["contentJson"])
        self.assertEqual(tip["content"][0]["attrs"]["language"], "rust")

    def test_code_brief_rust_and_python(self) -> None:
        rust = code_brief(
            "use std::io;\n\npub fn main() {\n    // TODO: wire CLI\n}\n",
            language="rust",
        )
        self.assertEqual(rust["language"], "rust")
        self.assertIn("main", rust["symbols"])
        self.assertTrue(any("TODO" in t for t in rust["todos"]))

        py = code_brief(
            "import os\n\ndef greet(name):\n    return name\n",
            language="python",
        )
        self.assertEqual(py["language"], "python")
        self.assertIn("greet", py["symbols"])
        self.assertIn("os", py["imports"])


if __name__ == "__main__":
    unittest.main()
