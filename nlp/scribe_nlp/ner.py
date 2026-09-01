from __future__ import annotations

from .text_utils import CAP_PHRASE_RE, DATE_RE, EMAIL_RE, HASHTAG_RE


def extract_entities(text: str) -> dict[str, object]:
    entities: list[dict[str, str]] = []
    suggestions: list[str] = []

    for match in EMAIL_RE.finditer(text or ""):
        entities.append({"text": match.group(0), "kind": "email"})
        suggestions.append("contact")

    for match in DATE_RE.finditer(text or ""):
        entities.append({"text": match.group(0), "kind": "date"})
        suggestions.append(f"date:{match.group(0)}")

    for match in HASHTAG_RE.finditer(text or ""):
        tag = match.group(1)
        entities.append({"text": tag, "kind": "hashtag"})
        suggestions.append(tag)

    for match in CAP_PHRASE_RE.finditer(text or ""):
        phrase = match.group(1).strip()
        if len(phrase) < 4:
            continue
        entities.append({"text": phrase, "kind": "phrase"})
        suggestions.append(phrase.lower().replace(" ", "-"))

    unique_suggestions: list[str] = []
    seen: set[str] = set()
    for item in suggestions:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        unique_suggestions.append(item)

    return {"entities": entities, "tagSuggestions": unique_suggestions[:12]}
