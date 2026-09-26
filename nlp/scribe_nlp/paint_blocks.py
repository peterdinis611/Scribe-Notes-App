"""Extract OCR text stored on TipTap paintPad nodes (after in-app OCR)."""

from __future__ import annotations

import json
from typing import Any


def extract_paint_ocr(content_json: str | dict[str, Any] | None) -> list[str]:
    """Return non-empty OCR captions from paintPad blocks in TipTap JSON."""
    if content_json is None:
        return []
    if isinstance(content_json, str):
        raw = content_json.strip()
        if not raw:
            return []
        try:
            doc = json.loads(raw)
        except json.JSONDecodeError:
            return []
    else:
        doc = content_json

    found: list[str] = []
    _walk(doc, found)
    return found


def _walk(node: Any, found: list[str]) -> None:
    if isinstance(node, list):
        for item in node:
            _walk(item, found)
        return
    if not isinstance(node, dict):
        return
    if node.get("type") == "paintPad":
        attrs = node.get("attrs") or {}
        text = str(attrs.get("ocrText") or "").strip()
        if text:
            found.append(text)
    content = node.get("content")
    if isinstance(content, list):
        for child in content:
            _walk(child, found)
