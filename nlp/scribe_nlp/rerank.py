from __future__ import annotations

from typing import Any

from .bm25_search import bm25_available, bm25_rank
from .embed import embed_batch, embed_text

MAX_RERANK = 24


def cosine(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right):
        return 0.0
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for a, b in zip(left, right):
        dot += a * b
        norm_a += a * a
        norm_b += b * b
    if norm_a <= 0.0 or norm_b <= 0.0:
        return 0.0
    return dot / ((norm_a ** 0.5) * (norm_b ** 0.5))


def rerank_passages(
    query: str,
    passages: list[dict[str, Any]],
    *,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    """Reorder passages by BM25 (optional) + embedding cosine."""
    if len(passages) <= 1:
        return list(passages)
    cap = max(1, min(int(limit or MAX_RERANK), MAX_RERANK))
    pool = passages[:MAX_RERANK]
    texts = [
        f"{item.get('title') or ''}\n{item.get('snippet') or item.get('text') or ''}".strip()
        for item in pool
    ]

    bm25_scores = [0.0] * len(pool)
    if bm25_available() and query.strip():
        for index, score in bm25_rank(query, texts, limit=len(texts)):
            if 0 <= index < len(bm25_scores):
                bm25_scores[index] = max(0.0, float(score))

    try:
        query_vec = embed_text(query)
        passage_vecs = embed_batch(texts)
    except Exception:
        # Lexical-only path when embed fails.
        scored_lex: list[tuple[float, int, dict[str, Any]]] = []
        for index, item in enumerate(pool):
            lexical = 0.0
            try:
                lexical = min(0.35, max(0.0, float(item.get("score") or 0.0)))
            except (TypeError, ValueError):
                lexical = 0.0
            score = 0.65 * bm25_scores[index] + 0.35 * lexical
            updated = dict(item)
            updated["score"] = score
            scored_lex.append((score, index, updated))
        scored_lex.sort(key=lambda row: (-row[0], row[1]))
        return [item for _, _, item in scored_lex[:cap]]

    scored: list[tuple[float, int, dict[str, Any]]] = []
    for index, (item, vector) in enumerate(zip(pool, passage_vecs)):
        lexical = 0.0
        try:
            lexical = min(0.35, max(0.0, float(item.get("score") or 0.0)))
        except (TypeError, ValueError):
            lexical = 0.0
        embed_score = cosine(query_vec, vector)
        if bm25_available():
            score = 0.55 * embed_score + 0.30 * bm25_scores[index] + 0.15 * lexical
        else:
            score = 0.72 * embed_score + 0.28 * lexical
        updated = dict(item)
        updated["score"] = score
        scored.append((score, index, updated))

    scored.sort(key=lambda row: (-row[0], row[1]))
    return [item for _, _, item in scored[:cap]]
