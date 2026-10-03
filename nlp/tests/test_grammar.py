from __future__ import annotations

import unittest

from scribe_nlp.grammar import check_grammar, normalize_rules
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


class GrammarTests(unittest.TestCase):
    def test_normalize_rules_dedupes(self) -> None:
        rules = normalize_rules(
            ["Prefer colour over color", "prefer colour over color", "x", "  Keep Atlas capitalized  "]
        )
        self.assertEqual(len(rules), 2)
        self.assertTrue(rules[0].startswith("Prefer"))

    def test_prefer_pair_findings(self) -> None:
        result = check_grammar(
            "The color of the sky is blue.",
            rules=["Prefer colour over color"],
        )
        self.assertGreaterEqual(result["findingCount"], 1)
        hit = next(item for item in result["findings"] if item["kind"] == "prefer")
        self.assertEqual(hit["match"].lower(), "color")
        self.assertEqual(hit["suggestion"], "colour")

    def test_avoid_rule(self) -> None:
        result = check_grammar(
            "Please use an anglicism here.",
            rules=["Never suggest anglicism"],
        )
        self.assertTrue(any(item["kind"] == "avoid" for item in result["findings"]))

    def test_guidance_when_unparsed(self) -> None:
        result = check_grammar(
            "Plain note without triggers.",
            rules=["Keep product names consistent with brand guide"],
        )
        self.assertEqual(result["rulesApplied"], 1)
        self.assertTrue(any(item["kind"] == "guidance" for item in result["findings"]))

    def test_rpc_grammar_check(self) -> None:
        response = rpc(
            "grammar_check",
            {
                "text": "color and color again",
                "rules": ["Prefer colour over color"],
                "limit": 10,
            },
        )
        self.assertNotIn("error", response)
        result = response["result"]
        self.assertGreaterEqual(result["findingCount"], 1)
        self.assertEqual(result["source"], "python")

    def test_health_lists_grammar(self) -> None:
        features = rpc("health")["result"]["features"]
        self.assertIn("grammarCheck", features)


if __name__ == "__main__":
    unittest.main()
