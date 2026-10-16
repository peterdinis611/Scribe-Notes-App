"""Markdown heading outline (mirrors ``crates/scribe-ui/src/markdown_outline.rs``)."""

from __future__ import annotations

import re
from typing import Any

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$")


def collect_markdown_heading_outline(markdown: str) -> list[dict[str, Any]]:
    lines = (markdown or "").split("\n")
    items: list[dict[str, Any]] = []
    offset = 0
    for line_index, line in enumerate(lines):
        match = _HEADING_RE.match(line)
        offset += len(line) + 1
        if not match:
            continue
        depth = len(match.group(1)) - 1
        preview = match.group(2).strip()
        char_offset = offset - len(line) - 1
        items.append(
            {
                "id": f"md-heading-{line_index}",
                "pos": char_offset,
                "kind": "heading",
                "label": f"Nadpis {depth + 1}",
                "preview": preview,
                "depth": depth,
            }
        )
    return items
