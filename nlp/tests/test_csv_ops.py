import json
import unittest

from scribe_nlp.csv_ops import (
    csv_to_tiptap,
    inspect_csv,
    matrix_to_csv,
    parse_csv_rows,
)
from scribe_nlp.server import handle_request


def rpc(method: str, params: dict | None = None) -> dict:
    return handle_request(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or {},
        }
    )


class CsvOpsTests(unittest.TestCase):
    def test_parse_quoted_comma(self) -> None:
        rows = parse_csv_rows('Name,Amount\nAlice,"1,2"\n')
        self.assertEqual(rows, [["Name", "Amount"], ["Alice", "1,2"]])

    def test_tsv_detect(self) -> None:
        rows = parse_csv_rows("A\tB\n1\t2\n")
        self.assertEqual(rows, [["A", "B"], ["1", "2"]])

    def test_matrix_roundtrip(self) -> None:
        rows = [["a", "b,c"], ["1", "2"]]
        text = matrix_to_csv(rows)
        self.assertIn('"b,c"', text)
        self.assertEqual(parse_csv_rows(text), rows)

    def test_csv_to_tiptap(self) -> None:
        result = csv_to_tiptap({"text": "H1,H2\nv1,v2\n"})
        doc = json.loads(result["contentJson"])
        self.assertEqual(doc["type"], "doc")
        self.assertEqual(doc["content"][0]["type"], "table")
        self.assertEqual(result["rowCount"], 2)

    def test_inspect_csv(self) -> None:
        meta = inspect_csv({"text": "a;b\n1;2\n"})
        self.assertEqual(meta["delimiter"], ";")
        self.assertEqual(meta["rowCount"], 2)

    def test_rpc_methods(self) -> None:
        health = rpc("health")["result"]
        self.assertIn("inspectCsv", health["features"])
        self.assertIn("csvToTiptap", health["features"])
        self.assertIn("matrixToCsv", health["features"])

        tip = rpc("csv_to_tiptap", {"text": "x,y\n1,2\n"})
        self.assertNotIn("error", tip)
        self.assertTrue(tip["result"]["ok"])

        out = rpc("matrix_to_csv", {"rows": [["a", "b"], ["1", "2"]]})
        self.assertEqual(out["result"]["text"], "a,b\n1,2\n")

        bad = rpc("inspect_csv", {})
        self.assertIn("error", bad)


if __name__ == "__main__":
    unittest.main()
