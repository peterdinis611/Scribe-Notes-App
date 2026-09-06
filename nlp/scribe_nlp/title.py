from __future__ import annotations

import re

from .keywords import extract_keywords
from .text_utils import normalize_text, split_sentences

HEADING = re.compile(r"^#{1,6}\s+(.+)$", re.MULTILINE)


def suggest_title(text: str, *, max_chars: int = 72) -> dict[str, object]:
    """Propose a document title + slug from heading / lead / keywords."""
    source = text or ""
    max_chars = max(16, min(int(max_chars or 72), 120))

    heading = HEADING.search(source)
    if heading:
        title = normalize_text(heading.group(1))
        return _pack(title, max_chars, source="heading")

    for sentence in split_sentences(source):
        cleaned = normalize_text(sentence)
        # Skip pure markdown bullets / checkboxes.
        if cleaned.startswith(("- ", "* ", "+ ", "[")):
            continue
        if len(cleaned) < 8:
            continue
        return _pack(cleaned, max_chars, source="lead")

    keywords = extract_keywords(source, limit=5)
    terms = [
        str(item.get("term") or "")
        for item in (keywords.get("keywords") or [])
        if item.get("term")
    ]
    if terms:
        title = " · ".join(terms[:3]).title()
        return _pack(title, max_chars, source="keywords")

    return {"title": "", "slug": "", "source": "empty"}


def _pack(title: str, max_chars: int, *, source: str) -> dict[str, object]:
    clipped = title
    if len(clipped) > max_chars:
        clipped = f"{clipped[: max_chars - 1].rstrip()}…"
    slug = _slugify(clipped)
    return {"title": clipped, "slug": slug, "source": source}


def _slugify(value: str) -> str:
    cleaned = normalize_text(value).lower()
    cleaned = re.sub(r"[^\w\u00C0-\u024F-]+", "-", cleaned, flags=re.UNICODE)
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    return cleaned[:80]
