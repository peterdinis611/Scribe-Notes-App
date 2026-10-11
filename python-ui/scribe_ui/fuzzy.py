"""Fuzzy ranking over string lists (stdlib; optional rapidfuzz).

Scores are normalised to 0..100 for both backends.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from typing import Callable, Optional, Sequence

try:  # resolved once, not on every call
    from rapidfuzz import fuzz as _rf_fuzz
except ImportError:  # pragma: no cover
    _rf_fuzz = None

Scorer = Callable[[str, str], float]

# Weights per field: primary, secondary, extra
DEFAULT_WEIGHTS: tuple[float, float, float] = (1.0, 0.6, 0.4)
RAPIDFUZZ_CUTOFF = 60.0


@dataclass(frozen=True)
class FuzzyRankItem:
    id: str
    primary: str
    secondary: str = ""
    extra: tuple[str, ...] = ()  # aliases, keywords, tags


@dataclass(frozen=True)
class FuzzyRankHit:
    id: str
    score: int
    field: str = ""  # which field matched best: primary/secondary/extra


def normalize(text: str) -> str:
    """Casefold and strip diacritics: 'Správa Používateľov' -> 'sprava pouzivatelov'."""
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _is_boundary(h: str, idx: int) -> bool:
    return idx == 0 or not h[idx - 1].isalnum()


def _subsequence_score(h: str, n: str) -> float:
    """Characters of n appear in order in h. Max 60, rewards runs and word starts."""
    pos = -1
    prev = -2
    bonus = 0.0
    gap_penalty = 0.0
    for ch in n:
        pos = h.find(ch, pos + 1)
        if pos < 0:
            return 0.0
        if pos == prev + 1:
            bonus += 4
        elif prev >= 0:
            gap_penalty += (pos - prev - 1) * 0.5
        if _is_boundary(h, pos):
            bonus += 6
        prev = pos
    return max(1.0, min(60.0, 30.0 + bonus - gap_penalty))


def stdlib_token_score(h: str, n: str) -> float:
    """Score one already-normalised token against a normalised haystack (0..100)."""
    if not h or not n:
        return 0.0
    if h == n:
        return 100.0
    if h.startswith(n):
        return 95.0 - min(len(h) - len(n), 20) * 0.25
    idx = h.find(n)
    if idx >= 0:
        base = 90.0 if _is_boundary(h, idx) else 75.0
        return base - min(idx, 30) * 0.5
    return _subsequence_score(h, n)


def rapidfuzz_token_score(h: str, n: str) -> float:
    if _rf_fuzz is None:
        return stdlib_token_score(h, n)
    s = float(_rf_fuzz.WRatio(n, h))
    return s if s >= RAPIDFUZZ_CUTOFF else 0.0


def default_scorer() -> Scorer:
    return rapidfuzz_token_score if _rf_fuzz is not None else stdlib_token_score


def _field_score(haystack: str, tokens: Sequence[str], scorer: Scorer) -> float:
    """All query tokens must match (AND); result is the mean token score."""
    if not haystack:
        return 0.0
    total = 0.0
    for tok in tokens:
        s = scorer(haystack, tok)
        if s <= 0:
            return 0.0
        total += s
    return total / len(tokens)


def fuzzy_rank_strings(
    items: Sequence[FuzzyRankItem],
    query: str,
    limit: Optional[int] = None,
    *,
    min_score: float = 0.0,
    weights: tuple[float, float, float] = DEFAULT_WEIGHTS,
    scorer: Optional[Scorer] = None,
) -> list[FuzzyRankHit]:
    """Rank items by fuzzy match against query.

    Empty query returns all items in original order with score 0.
    """
    if limit is not None and limit < 0:
        raise ValueError("limit must be >= 0")

    tokens = normalize(query).split()
    if not tokens:
        hits = [FuzzyRankHit(id=i.id, score=0) for i in items]
        return hits[:limit] if limit is not None else hits

    score_fn = scorer or default_scorer()
    w_primary, w_secondary, w_extra = weights
    ranked: list[tuple[float, int, FuzzyRankHit]] = []

    for item in items:
        candidates: list[tuple[float, str]] = []
        p = _field_score(normalize(item.primary), tokens, score_fn)
        if p > 0:
            candidates.append((p * w_primary, "primary"))
        s = _field_score(normalize(item.secondary), tokens, score_fn)
        if s > 0:
            candidates.append((s * w_secondary, "secondary"))
        for alias in item.extra:
            e = _field_score(normalize(alias), tokens, score_fn)
            if e > 0:
                candidates.append((e * w_extra, "extra"))
        if not candidates:
            continue

        candidates.sort(key=lambda c: -c[0])
        best, field = candidates[0]
        # Small bonus when another field also matches.
        if len(candidates) > 1:
            best += 0.1 * candidates[1][0]
        best = min(best, 100.0)
        if best < min_score:
            continue
        ranked.append((best, len(item.primary), FuzzyRankHit(item.id, round(best), field)))

    # score desc, shorter primary first, then id (deterministic)
    ranked.sort(key=lambda r: (-r[0], r[1], r[2].id))
    hits = [r[2] for r in ranked]
    return hits[:limit] if limit is not None else hits


if __name__ == "__main__":
    data = [
        FuzzyRankItem("1", "Správa používateľov", "Admin panel", ("users", "účty")),
        FuzzyRankItem("2", "Nastavenia", "Používateľský profil"),
        FuzzyRankItem("3", "Gitlab Settings", "", ("gs",)),
        FuzzyRankItem("4", "Spravodajstvo", "News"),
    ]
    assert fuzzy_rank_strings(data, "sprava pouzivatel")[0].id == "1"  # diakritika + tokeny
    assert fuzzy_rank_strings(data, "ucty")[0].field == "extra"
    assert fuzzy_rank_strings(data, "xyz") == []
    assert len(fuzzy_rank_strings(data, "", limit=2)) == 2
    assert fuzzy_rank_strings(data, "gls")[0].id == "3"  # subsequence
    print(fuzzy_rank_strings(data, "spra"))