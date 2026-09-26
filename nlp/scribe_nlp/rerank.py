from __future__ import annotations

from typing import Any

from .bm25_search import bm25_available, bm25_rank
from .embed import embed_batch, embed_text
from .embed_backend import active_backend, configure_backend

MAX_POOL = 96
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


def _passage_text(item: dict[str, Any]) -> str:
    return f"{item.get('title') or ''}\n{item.get('snippet') or item.get('text') or ''}".strip()


def _bm25_preselect(
    query: str,
    pool: list[dict[str, Any]],
    *,
    limit: int,
) -> list[dict[str, Any]]:
    """Rank a large candidate pool with BM25 (or token overlap) before expensive embedding."""
    if len(pool) <= limit:
        return list(pool)
    texts = [_passage_text(item) for item in pool]
    if query.strip():
        ranked = bm25_rank(query, texts, limit=limit)
        if ranked:
            selected = [pool[index] for index, _ in ranked if 0 <= index < len(pool)]
            if selected:
                # Keep a few high lexical/embed-score leftovers BM25 may have skipped.
                seen = {id(item) for item in selected}
                for item in pool:
                    if len(selected) >= limit:
                        break
                    if id(item) in seen:
                        continue
                    try:
                        score = float(item.get("score") or 0.0)
                    except (TypeError, ValueError):
                        score = 0.0
                    if score >= 0.35:
                        selected.append(item)
                        seen.add(id(item))
                return selected[:limit]
    return list(pool[:limit])


def rerank_passages(
    query: str,
    passages: list[dict[str, Any]],
    *,
    limit: int | None = None,
    embed_backend: str | None = None,
) -> list[dict[str, Any]]:
    """BM25-preselect a large pool, then reorder by BM25 + embedding cosine."""
    if len(passages) <= 1:
        return list(passages)
    cap = max(1, min(int(limit or MAX_RERANK), MAX_RERANK))
    pool = _bm25_preselect(query, passages[:MAX_POOL], limit=max(cap, min(MAX_RERANK, len(passages))))
    texts = [_passage_text(item) for item in pool]

    bm25_scores = [0.0] * len(pool)
    if bm25_available() and query.strip():
        for index, score in bm25_rank(query, texts, limit=len(texts)):
            if 0 <= index < len(bm25_scores):
                bm25_scores[index] = max(0.0, float(score))

    restore_backend: str | None = None
    if embed_backend:
        restore_backend = active_backend()
        configure_backend(embed_backend)

    try:
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
    finally:
        if restore_backend is not None:
            configure_backend(restore_backend)
