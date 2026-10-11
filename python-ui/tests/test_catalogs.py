from __future__ import annotations

import unittest

from scribe_ui import (
    agent_recipes,
    document_matches_meta_filters,
    document_matches_smart_filter,
    is_agent_recipe_id,
    next_cycle_theme,
    parse_tag,
)


class CatalogTests(unittest.TestCase):
    def test_agent_recipes(self) -> None:
        recipes = agent_recipes()
        self.assertEqual(len(recipes), 11)
        self.assertTrue(is_agent_recipe_id("deep_read"))
        deep = next(r for r in recipes if r["id"] == "deep_read")
        self.assertIn("section_summaries", deep["tools"])

    def test_tag_meta(self) -> None:
        parsed = parse_tag("status:draft")
        self.assertEqual(parsed["kind"], "status")
        self.assertTrue(
            document_matches_meta_filters(
                ["status:draft", "project:scribe"],
                {"status": "draft"},
            )
        )
        self.assertFalse(
            document_matches_meta_filters(["status:done"], {"status": "draft"})
        )

    def test_smart_filters(self) -> None:
        doc = {"id": "a", "tags": []}
        self.assertTrue(document_matches_smart_filter(doc, "untagged"))
        self.assertTrue(
            document_matches_smart_filter(
                {"id": "a", "tags": ["x"]},
                "unlinked",
                {"orphanIds": ["a"]},
            )
        )

    def test_theme_cycle(self) -> None:
        self.assertEqual(next_cycle_theme("light"), "dark")
        self.assertEqual(next_cycle_theme("unknown"), "system")


if __name__ == "__main__":
    unittest.main()
