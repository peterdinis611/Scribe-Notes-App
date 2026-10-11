from __future__ import annotations

import unittest

from scribe_ui import (
    FuzzyRankItem,
    fuzzy_rank_strings,
    heading_label,
    resolve_paragraph_style,
    sanitize_file_name,
    sanitize_snippet,
    short_version,
)
from scribe_ui.version import short_version_of


class HelperTests(unittest.TestCase):
    def test_short_version(self) -> None:
        self.assertEqual(short_version_of("3.5.0"), "3.5")
        self.assertEqual(short_version_of("1.0"), "1.0")
        self.assertRegex(short_version(), r"^\d+\.\d+$")

    def test_filenames(self) -> None:
        self.assertEqual(sanitize_file_name("a/b:c", "md"), "a b c.md")
        self.assertEqual(sanitize_file_name("   ", "txt"), "scribe.txt")

    def test_snippet(self) -> None:
        self.assertEqual(
            sanitize_snippet("Hello <b>x</b> <mark>world</mark> !"),
            "Hello x <mark>world</mark> !",
        )
        self.assertEqual(sanitize_snippet("<mark>a</mark><em>b</em>"), "<mark>a</mark>b")

    def test_fuzzy_ranks_primary(self) -> None:
        items = [
            FuzzyRankItem(id="1", primary="Meeting notes", secondary="work"),
            FuzzyRankItem(id="2", primary="Grocery list"),
        ]
        hits = fuzzy_rank_strings(items, "meet")
        self.assertEqual(hits[0].id, "1")

    def test_heading_and_paragraph(self) -> None:
        self.assertEqual(heading_label(2), "Nadpis 2")
        title = resolve_paragraph_style("title")
        assert title is not None
        self.assertEqual(title["headingLevel"], 1)
        self.assertIsNone(resolve_paragraph_style("nope"))


if __name__ == "__main__":
    unittest.main()
