import json
import unittest

from scribe_nlp.server import handle_request
from scribe_nlp.xml_ops import (
    inspect_xml,
    is_xml_document_extension,
    xml_text_to_tiptap_doc,
    xml_to_tiptap,
)


def rpc(method: str, params: dict | None = None) -> dict:
    return handle_request(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or {},
        }
    )


SAMPLE = """<?xml version="1.0"?>
<root>
  <person id="1">
    <name>Ada Lovelace</name>
    <role>Mathematician</role>
  </person>
</root>
"""


class XmlOpsTests(unittest.TestCase):
    def test_extensions(self) -> None:
        self.assertTrue(is_xml_document_extension("xml"))
        self.assertTrue(is_xml_document_extension(".rss"))
        self.assertFalse(is_xml_document_extension("svg"))
        self.assertFalse(is_xml_document_extension("html"))

    def test_structured_outline(self) -> None:
        doc = xml_text_to_tiptap_doc(SAMPLE)
        types = [n["type"] for n in doc["content"]]
        self.assertIn("heading", types)
        joined = json.dumps(doc)
        self.assertIn("person", joined)
        self.assertIn("Ada Lovelace", joined)
        self.assertNotIn("codeBlock", joined)

    def test_malformed_falls_back(self) -> None:
        doc = xml_text_to_tiptap_doc("<not closed")
        self.assertEqual(doc["content"][0]["type"], "codeBlock")

    def test_inspect_xml(self) -> None:
        meta = inspect_xml({"text": SAMPLE})
        self.assertTrue(meta["wellFormed"])
        self.assertEqual(meta["rootTag"], "root")
        self.assertGreaterEqual(meta["childCount"], 1)

    def test_xml_to_tiptap(self) -> None:
        result = xml_to_tiptap({"text": SAMPLE})
        doc = json.loads(result["contentJson"])
        self.assertEqual(doc["type"], "doc")
        self.assertTrue(result["wellFormed"])

    def test_rpc_methods(self) -> None:
        health = rpc("health")["result"]
        self.assertIn("inspectXml", health["features"])
        self.assertIn("xmlToTiptap", health["features"])

        tip = rpc("xml_to_tiptap", {"text": SAMPLE})
        self.assertNotIn("error", tip)
        self.assertTrue(tip["result"]["ok"])

        bad = rpc("inspect_xml", {})
        self.assertIn("error", bad)


if __name__ == "__main__":
    unittest.main()
