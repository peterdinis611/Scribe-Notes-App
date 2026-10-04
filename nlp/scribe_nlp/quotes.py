"""Pull memorable quotes / citation-worthy lines from a note."""

from __future__ import annotations

import re
from typing import Any

from .text_utils import content_tokens, normalize_text, split_sentences

_QUOTED_RE = re.compile(r'[„“"«]([^„“"»]{12,220})[“"»]')
_ATTRIBUTION_RE = re.compile(
    r"\s[-–—]\s*([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][\w.\- ]{1,60})$"
)
_SIGNAL_RE = re.compile(
    r"\b(said|wrote|noted|quoted|according to|povedal|napísal|uviedol|cituje)\b",
    re.IGNORECASE,
)


def extract_quotes(text: str, *, limit: int = 10) -> dict[str, Any]:
    source = text or ""
    limit = max(1, min(int(limit or 10), 30))

    quotes: list[dict[str, Any]] = []
    seen: set[str] = set()

    def push(quote: str, *, kind: str, attribution: str | None = None, score: float = 1.0) -> None:
        cleaned = normalize_text(quote)
        if len(cleaned) < 12:
            return
        key = cleaned.lower()
        if key in seen:
            return
        seen.add(key)
        quotes.append(
            {
                "text": cleaned,
                "kind": kind,
                "attribution": attribution,
                "score": round(score, 3),
            }
        )

    for match in _QUOTED_RE.finditer(source):
        quote = match.group(1)
        tail = source[match.end() : match.end() + 80]
        attr_match = _ATTRIBUTION_RE.search(tail) or _ATTRIBUTION_RE.search(quote)
        attribution = normalize_text(attr_match.group(1)) if attr_match else None
        push(quote, kind="quoted", attribution=attribution, score=2.5)

    for sentence in split_sentences(source):
        cleaned = normalize_text(sentence)
        if len(cleaned) < 28 or len(cleaned) > 240:
            continue
        score = 0.0
        if _SIGNAL_RE.search(cleaned):
            score += 1.6
        tokens = content_tokens(cleaned)
        if 8 <= len(tokens) <= 28:
            score += 0.8
        if cleaned.endswith((".", "!", "?")) and cleaned[:1].isupper():
            score += 0.4
        # Aphorism-ish: short, punchy, few commas
        if cleaned.count(",") <= 1 and 40 <= len(cleaned) <= 140:
            score += 0.5
        if score >= 1.8:
            push(cleaned, kind="salient", score=score)

    quotes.sort(key=lambda item: float(item["score"]), reverse=True)
    trimmed = quotes[:limit]
    return {
        "quotes": trimmed,
        "count": len(trimmed),
        "source": "python",
    }
