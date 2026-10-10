"""Fuzzy ranking over string lists (stdlib; optional rapidfuzz)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class FuzzyRankItem:
    id: str
    primary: str
    secondary: str = ""


@dataclass(frozen=True)
class FuzzyRankHit:
    id: str
    score: int


def _stdlib_score(haystack: str, needle: str) -> int:
    """Simple subsequence score; higher is better. 0 = no match."""
    if not needle:
        return 0
    h = haystack.casefold()
    n = needle.casefold()
    if n in h:
        # Prefer earlier + tighter matches.
        idx = h.find(n)
        return 1000 - idx + min(len(n) * 10, 200)

    hi = 0
    consecutive = 0
    best_run = 0
    matched = 0
    for ch in n:
        found = h.find(ch, hi)
        if found < 0:
            return 0
        if found == hi:
            consecutive += 1
            best_run = max(best_run, consecutive)
        else:
            consecutive = 1
        matched += 1
        hi = found + 1
    return matched * 20 + best_run * 15


def _rapidfuzz_score(haystack: str, needle: str) -> int:
    try:
        from rapidfuzz import fuzz
    except ImportError:
        return _stdlib_score(haystack, needle)
    return int(fuzz.WRatio(needle, haystack))


def _score_field(haystack: str, needle: str) -> int:
    if not haystack:
        return 0
    try:
        import rapidfuzz  # noqa: F401

        return _rapidfuzz_score(haystack, needle)
    except ImportError:
        return _stdlib_score(haystack, needle)


def fuzzy_rank_strings(
    items: list[FuzzyRankItem],
    query: str,
    limit: Optional[int] = None,
) -> list[FuzzyRankHit]:
    q = query.strip()
    if not q:
        hits = [FuzzyRankHit(id=item.id, score=0) for item in items]
        return hits[:limit] if limit is not None else hits

    ranked: list[FuzzyRankHit] = []
    for item in items:
        primary = _score_field(item.primary, q)
        secondary = _score_field(item.secondary, q) if item.secondary else 0
        # Weight primary higher (similar to fuse 0.75 / 0.25 / Rust *3).
        score = primary * 3 + secondary
        if score > 0:
            ranked.append(FuzzyRankHit(id=item.id, score=score))

    ranked.sort(key=lambda hit: (-hit.score, hit.id))
    return ranked[:limit] if limit is not None else ranked
