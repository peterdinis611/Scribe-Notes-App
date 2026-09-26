"""Extract key takeaways / executive bullets from a note."""

from __future__ import annotations

import re
from typing import Any

from .summarize import summarize_text
from .text_utils import content_tokens, normalize_text, split_sentences, top_terms

_SIGNAL_RE = re.compile(
    r"\b(important|key|note|remember|decision|agreed|action|must|should|"
    r"dôležité|kľúčové|rozhodnutie|dohodli|akcia|treba|musíme)\b",
    re.IGNORECASE,
)
_BULLET_RE = re.compile(r"^\s*[-*•–]\s+(.+)$")


def extract_takeaways(text: str, *, limit: int = 8) -> dict[str, Any]:
    source = text or ""
    limit = max(1, min(int(limit or 8), 20))
    sentences = [normalize_text(item) for item in split_sentences(source) if item.strip()]
    bullets_raw = [
        normalize_text(match.group(1))
        for line in source.splitlines()
        if (match := _BULLET_RE.match(line))
    ]

    scored: list[tuple[float, str, str]] = []
    for sentence in sentences:
        if len(sentence) < 24:
            continue
        score = 0.0
        if _SIGNAL_RE.search(sentence):
            score += 2.5
        if sentence.endswith("!"):
            score += 0.4
        words = content_tokens(sentence)
        score += min(1.5, len(words) / 18.0)
        if 40 <= len(sentence) <= 220:
            score += 0.8
        scored.append((score, sentence, "sentence"))

    for bullet in bullets_raw:
        if len(bullet) < 12:
            continue
        score = 1.8 + (0.6 if _SIGNAL_RE.search(bullet) else 0.0)
        scored.append((score, bullet, "bullet"))

    scored.sort(key=lambda item: item[0], reverse=True)
    takeaways: list[dict[str, Any]] = []
    seen: set[str] = set()
    for score, text_item, kind in scored:
        key = text_item.lower()
        if key in seen:
            continue
        seen.add(key)
        takeaways.append(
            {
                "text": text_item,
                "kind": kind,
                "score": round(score, 3),
            }
        )
        if len(takeaways) >= limit:
            break

    summary = ""
    if takeaways:
        joined = " ".join(item["text"] for item in takeaways[:4])
        summary = str(summarize_text(joined, max_sentences=2).get("summary") or takeaways[0]["text"])

    return {
        "summary": summary,
        "takeaways": takeaways,
        "count": len(takeaways),
        "themes": [{"term": term, "count": count} for term, count in top_terms([source], limit=8)],
        "source": "python",
    }
