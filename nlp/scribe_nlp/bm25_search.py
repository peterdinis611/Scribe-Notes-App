"""Optional BM25 lexical ranking (bm25s) for hybrid search / answer rerank."""

from __future__ import annotations

from .extras import has_bm25s
from .text_utils import tokenize


def bm25_available() -> bool:
    return has_bm25s()


def _fallback_tokens(text: str) -> list[str]:
    return [token for token in tokenize(text or "") if token]


def bm25_rank(
    query: str,
    documents: list[str],
    *,
    limit: int | None = None,
) -> list[tuple[int, float]]:
    """Return (doc_index, normalized_score 0..1) sorted by score desc."""
    if not query.strip() or not documents:
        return []
    limit = max(1, min(int(limit or len(documents)), len(documents)))

    if has_bm25s():
        try:
            import bm25s

            corpus_tokens = bm25s.tokenize(documents, stopwords="en")
            retriever = bm25s.BM25()
            retriever.index(corpus_tokens)
            query_tokens = bm25s.tokenize(query, stopwords="en")
            # get_scores expects a flat token list for a single query.
            if isinstance(query_tokens, list) and query_tokens and isinstance(query_tokens[0], list):
                flat_query = query_tokens[0]
            else:
                flat_query = list(query_tokens) if not isinstance(query_tokens, list) else query_tokens
            if not flat_query:
                return []
            scores = retriever.get_scores(flat_query)
            pairs = [(index, float(score)) for index, score in enumerate(scores) if float(score) > 0]
            if not pairs:
                return []
            max_score = max(score for _, score in pairs) or 1.0
            pairs = [(index, score / max_score) for index, score in pairs]
            pairs.sort(key=lambda item: item[1], reverse=True)
            return pairs[:limit]
        except Exception:
            pass

    # Soft fallback: token overlap ratio.
    query_set = set(_fallback_tokens(query))
    if not query_set:
        return []
    scored: list[tuple[int, float]] = []
    for index, document in enumerate(documents):
        doc_set = set(_fallback_tokens(document))
        if not doc_set:
            continue
        score = len(query_set & doc_set) / max(len(query_set), 1)
        if score > 0:
            scored.append((index, score))
    scored.sort(key=lambda item: item[1], reverse=True)
    return scored[:limit]
