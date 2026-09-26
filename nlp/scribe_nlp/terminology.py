"""Terminology consistency checks inside a single document."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any

from .normalize import fold_diacritics
from .text_utils import content_tokens

_MULTIWORD_RE = re.compile(
    r"\b([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][\w\u00C0-\u024F-]{2,}(?:\s+[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][\w\u00C0-\u024F-]{2,}){0,3})\b"
)


def check_terminology(text: str, *, limit: int = 12) -> dict[str, Any]:
    """Find near-duplicate spellings / casing variants of the same term."""
    source = text or ""
    limit = max(1, min(int(limit or 12), 30))

    raw_terms: list[str] = []
    for match in _MULTIWORD_RE.finditer(source):
        term = match.group(1).strip()
        if len(term) >= 3:
            raw_terms.append(term)

    # Also include frequent content tokens (length >= 6).
    for token in content_tokens(source):
        if len(token) >= 6:
            raw_terms.append(token)

    groups: dict[str, Counter[str]] = defaultdict(Counter)
    for term in raw_terms:
        key = _normalize_key(term)
        if len(key) < 4:
            continue
        groups[key][term] += 1

    issues: list[dict[str, Any]] = []
    for key, counter in groups.items():
        variants = [item for item, _count in counter.most_common() if item]
        if len(variants) < 2:
            continue
        # Prefer the most frequent spelling as canonical.
        preferred, preferred_count = counter.most_common(1)[0]
        others = [(term, count) for term, count in counter.most_common() if term != preferred]
        if not others:
            continue
        issues.append(
            {
                "canonical": preferred,
                "key": key,
                "preferredCount": preferred_count,
                "variants": [
                    {"term": term, "count": count} for term, count in others[:6]
                ],
                "suggestion": f"Use “{preferred}” consistently",
            }
        )

    issues.sort(key=lambda item: len(item["variants"]), reverse=True)
    return {
        "issues": issues[:limit],
        "issueCount": min(len(issues), limit),
        "scannedTerms": len(raw_terms),
        "source": "python",
    }


def _normalize_key(term: str) -> str:
    folded = fold_diacritics(term).lower()
    folded = re.sub(r"[^a-z0-9\s-]+", "", folded)
    folded = re.sub(r"\s+", " ", folded).strip()
    # Collapse common plural/suffix noise lightly.
    if folded.endswith("ies") and len(folded) > 5:
        folded = folded[:-3] + "y"
    elif folded.endswith("s") and not folded.endswith("ss") and len(folded) > 4:
        folded = folded[:-1]
    return folded
