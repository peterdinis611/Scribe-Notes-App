from __future__ import annotations

import unittest

from scribe_ui.library_assets import (
    asset_kind,
    filter_library_assets,
    format_bytes,
    is_orphan_asset,
    is_previewable_kind,
    is_video_kind,
)
from scribe_ui.markdown_outline import collect_markdown_heading_outline
from scribe_ui.orphan_links import suggest_orphan_links
from scribe_ui.resolve_color import is_theme_color_key, resolve_color
from scribe_ui.smart_filters import filter_documents


class LibraryAssetsTests(unittest.TestCase):
    def test_kind_and_format(self) -> None:
        self.assertEqual(asset_kind("MP4"), "video")
        self.assertEqual(asset_kind(".svg"), "svg")
        self.assertTrue(is_video_kind("video"))
        self.assertTrue(is_previewable_kind("image"))
        self.assertTrue(is_orphan_asset(None))
        self.assertEqual(format_bytes(1536), "1.5 KB")

    def test_filter(self) -> None:
        assets = [
            {
                "kind": "video",
                "fileName": "a.mp4",
                "extension": "mp4",
                "documentId": "d1",
                "documentTitle": "Talk",
            },
            {
                "kind": "image",
                "fileName": "orphan.png",
                "extension": "png",
                "documentId": "d2",
                "documentTitle": None,
            },
        ]
        self.assertEqual(len(filter_library_assets(assets, "video", "")), 1)
        self.assertEqual(len(filter_library_assets(assets, "orphans", "")), 1)
        self.assertEqual(len(filter_library_assets(assets, "all", "talk")), 1)


class ResolveColorTests(unittest.TestCase):
    def test_resolve(self) -> None:
        colors = {"primary": "#00f", "foreground": "#111"}
        self.assertTrue(is_theme_color_key("primary"))
        self.assertEqual(resolve_color("primary", colors), "#00f")
        self.assertEqual(resolve_color("#abc", colors), "#abc")


class OrphanLinksTests(unittest.TestCase):
    def test_suggest(self) -> None:
        rows = [
            {
                "id": "a",
                "title": "A",
                "similar": [
                    {"documentId": "a", "title": "A"},
                    {"documentId": "b", "title": "B", "rank": 1.5},
                ],
            }
        ]
        out = suggest_orphan_links(rows)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["targetId"], "b")


class MarkdownOutlineTests(unittest.TestCase):
    def test_outline(self) -> None:
        items = collect_markdown_heading_outline("# One\n\n## Two\n")
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["preview"], "One")
        self.assertEqual(items[1]["depth"], 1)


class SmartFilterBatchTests(unittest.TestCase):
    def test_filter_documents(self) -> None:
        docs = [
            {"id": "a", "tags": []},
            {"id": "b", "tags": ["x"]},
        ]
        out = filter_documents(docs, "untagged")
        self.assertEqual([d["id"] for d in out], ["a"])


if __name__ == "__main__":
    unittest.main()
