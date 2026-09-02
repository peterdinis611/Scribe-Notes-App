from __future__ import annotations

import re

from .text_utils import (
    CAP_PHRASE_RE,
    DATE_RE,
    EMAIL_RE,
    HASHTAG_RE,
    PHONE_RE,
    URL_RE,
    WIKI_LINK_RE,
    normalize_text,
)


def _slugify(value: str) -> str:
    cleaned = normalize_text(value).lower()
    cleaned = re.sub(r"[^\w\u00C0-\u024F-]+", "-", cleaned, flags=re.UNICODE)
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    return cleaned or value.lower()


def _append_unique(items: list[str], seen: set[str], value: str) -> None:
    key = value.lower()
    if key in seen:
        return
    seen.add(key)
    items.append(value)


def extract_entities(text: str) -> dict[str, object]:
    source = text or ""
    entities: list[dict[str, str]] = []
    suggestions: list[str] = []
    seen_suggestions: set[str] = set()

    for match in EMAIL_RE.finditer(source):
        entities.append({"text": match.group(0), "kind": "email"})
        _append_unique(suggestions, seen_suggestions, "kontakt")

    for match in PHONE_RE.finditer(source):
        entities.append({"text": match.group(0), "kind": "phone"})
        _append_unique(suggestions, seen_suggestions, "kontakt")

    for match in URL_RE.finditer(source):
        entities.append({"text": match.group(0), "kind": "url"})
        _append_unique(suggestions, seen_suggestions, "odkaz")

    for match in DATE_RE.finditer(source):
        entities.append({"text": match.group(0), "kind": "date"})
        _append_unique(suggestions, seen_suggestions, f"datum:{match.group(0)}")

    for match in HASHTAG_RE.finditer(source):
        tag = match.group(1)
        entities.append({"text": tag, "kind": "hashtag"})
        _append_unique(suggestions, seen_suggestions, _slugify(tag))

    for match in WIKI_LINK_RE.finditer(source):
        target = normalize_text(match.group(1))
        if len(target) < 2:
            continue
        entities.append({"text": target, "kind": "wiki_link"})
        _append_unique(suggestions, seen_suggestions, _slugify(target))

    for match in CAP_PHRASE_RE.finditer(source):
        phrase = normalize_text(match.group(1))
        if len(phrase) < 4:
            continue
        entities.append({"text": phrase, "kind": "phrase"})
        _append_unique(suggestions, seen_suggestions, _slugify(phrase))

    return {"entities": entities, "tagSuggestions": suggestions[:12]}
