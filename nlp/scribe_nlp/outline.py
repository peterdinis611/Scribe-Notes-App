from __future__ import annotations

import re

from .text_utils import normalize_text, split_sentences

HEADING_LINE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
NUMBERED_SECTION = re.compile(
    r"(?m)^(?:#{1,6}\s+|(?:\d{1,2}|[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ])[.)]\s+)(.+)$"
)
ALL_CAPS_LINE = re.compile(
    r"(?m)^([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ0-9\s\-]{3,80})$"
)


def extract_outline(text: str, limit: int = 40) -> dict[str, object]:
    """Lightweight structural outline from markdown headings / numbered lines."""
    source = text or ""
    items: list[dict[str, object]] = []
    seen: set[str] = set()

    for match in HEADING_LINE.finditer(source):
        level = len(match.group(1))
        title = normalize_text(match.group(2))
        if len(title) < 2:
            continue
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        items.append(
            {
                "title": title,
                "level": level,
                "kind": "heading",
            }
        )
        if len(items) >= limit:
            return {"items": items, "count": len(items)}

    if not items:
        for match in NUMBERED_SECTION.finditer(source):
            title = normalize_text(match.group(1))
            if len(title) < 3:
                continue
            key = title.lower()
            if key in seen:
                continue
            seen.add(key)
            items.append({"title": title, "level": 2, "kind": "section"})
            if len(items) >= limit:
                break

    if not items:
        for match in ALL_CAPS_LINE.finditer(source):
            title = normalize_text(match.group(1))
            if len(title) < 4:
                continue
            key = title.lower()
            if key in seen:
                continue
            seen.add(key)
            items.append({"title": title.title(), "level": 2, "kind": "label"})
            if len(items) >= min(limit, 12):
                break

    if not items:
        # Fallback: first N non-trivial sentences as soft outline.
        for sentence in split_sentences(source)[:8]:
            if len(sentence) < 20:
                continue
            title = sentence if len(sentence) <= 72 else f"{sentence[:69].rstrip()}…"
            items.append({"title": title, "level": 3, "kind": "sentence"})

    return {"items": items[:limit], "count": len(items[:limit])}
