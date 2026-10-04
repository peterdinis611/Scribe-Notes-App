"""Heuristic contradiction / conflict hints between two note texts."""

from __future__ import annotations

import re
from typing import Any

from .text_utils import content_tokens, jaccard_similarity, normalize_text, split_sentences

_NEGATION_RE = re.compile(
    r"\b(not|never|no|cannot|can't|won't|without|"
    r"nie|nikdy|nemožno|nemôže|bez)\b",
    re.IGNORECASE,
)
_NUMBER_RE = re.compile(r"\b(\d+(?:[.,]\d+)?)\s*(%|percent|€|\$|ks|days?|dní|hodín?)?\b", re.I)


def _claim_key(sentence: str) -> frozenset[str]:
    tokens = [t for t in content_tokens(sentence) if len(t) >= 3]
    return frozenset(tokens[:12])


def contradiction_hints(
    text_a: str,
    text_b: str,
    *,
    title_a: str | None = None,
    title_b: str | None = None,
    limit: int = 8,
) -> dict[str, Any]:
    a = text_a or ""
    b = text_b or ""
    limit = max(1, min(int(limit or 8), 20))
    if not a.strip() or not b.strip():
        raise ValueError("both texts are required")

    sentences_a = [normalize_text(s) for s in split_sentences(a) if len(s.strip()) >= 24]
    sentences_b = [normalize_text(s) for s in split_sentences(b) if len(s.strip()) >= 24]

    hints: list[dict[str, Any]] = []

    for sa in sentences_a[:40]:
        key_a = _claim_key(sa)
        if len(key_a) < 3:
            continue
        neg_a = bool(_NEGATION_RE.search(sa))
        nums_a = {m.group(0).lower() for m in _NUMBER_RE.finditer(sa)}
        for sb in sentences_b[:40]:
            key_b = _claim_key(sb)
            if len(key_b) < 3:
                continue
            overlap = len(key_a & key_b) / max(1, len(key_a | key_b))
            if overlap < 0.35:
                continue
            sim = jaccard_similarity(sa, sb)
            neg_b = bool(_NEGATION_RE.search(sb))
            nums_b = {m.group(0).lower() for m in _NUMBER_RE.finditer(sb)}
            reasons: list[str] = []
            score = overlap
            if neg_a != neg_b and overlap >= 0.4:
                reasons.append("negation_mismatch")
                score += 0.35
            if nums_a and nums_b and nums_a != nums_b and overlap >= 0.3:
                reasons.append("numeric_mismatch")
                score += 0.3
            if sim > 0.55 and neg_a != neg_b:
                reasons.append("near_duplicate_opposite")
                score += 0.25
            if not reasons:
                continue
            hints.append(
                {
                    "textA": sa,
                    "textB": sb,
                    "score": round(score, 3),
                    "reasons": reasons,
                    "overlap": round(overlap, 3),
                }
            )

    hints.sort(key=lambda item: float(item["score"]), reverse=True)
    # Dedup by textA
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for item in hints:
        key = item["textA"].lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
        if len(unique) >= limit:
            break

    return {
        "titleA": title_a,
        "titleB": title_b,
        "hints": unique,
        "count": len(unique),
        "source": "python",
    }
