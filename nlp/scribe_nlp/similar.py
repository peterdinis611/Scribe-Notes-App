from __future__ import annotations

from .embed import cosine_similarity, embed_text
from .keywords import extract_keywords
from .text_utils import content_tokens, jaccard_similarity, normalize_text


def _doc_blob(document: dict[str, object]) -> str:
    title = str(document.get("title") or "")
    text = str(document.get("text") or "")
    return f"{title}\n{text}".strip()


def similar_notes(
    query_text: str,
    documents: list[dict[str, object]],
    limit: int = 8,
    *,
    use_embeddings: bool = True,
) -> dict[str, object]:
    """Rank notes by keyword overlap, optionally blended with hash embeddings."""
    query = normalize_text(query_text)
    if not query or not documents:
        return {"matches": []}

    query_tokens = set(content_tokens(query))
    query_keywords = {
        str(item.get("term") or "")
        for item in (extract_keywords(query, limit=16).get("keywords") or [])
    }
    limit = max(1, min(int(limit or 8), 32))

    query_vec: list[float] | None = None
    if use_embeddings and len(query) >= 12:
        query_vec = embed_text(query)

    scored: list[dict[str, object]] = []
    for document in documents:
        doc_id = str(document.get("id") or "")
        if not doc_id:
            continue
        blob = _doc_blob(document)
        if not blob:
            continue

        token_score = jaccard_similarity(query, blob)
        doc_tokens = set(content_tokens(blob))
        keyword_overlap = 0.0
        if query_keywords and doc_tokens:
            keyword_overlap = len(query_keywords & doc_tokens) / max(len(query_keywords), 1)

        title = str(document.get("title") or "")
        title_boost = 0.0
        if title:
            title_tokens = set(content_tokens(title))
            if title_tokens and query_tokens:
                title_boost = 0.15 * (
                    len(title_tokens & query_tokens) / max(len(title_tokens), 1)
                )

        embed_score = 0.0
        if query_vec is not None and len(blob) >= 12:
            embed_score = max(0.0, cosine_similarity(query_vec, embed_text(blob)))

        if query_vec is not None:
            score = (
                0.35 * token_score
                + 0.22 * keyword_overlap
                + 0.28 * embed_score
                + title_boost
            )
        else:
            score = 0.55 * token_score + 0.30 * keyword_overlap + title_boost

        if score <= 0.02:
            continue

        snippet_source = str(document.get("text") or title)
        snippet = normalize_text(snippet_source)
        if len(snippet) > 140:
            snippet = f"{snippet[:137].rstrip()}…"

        scored.append(
            {
                "id": doc_id,
                "title": title or "Bez názvu",
                "score": round(score, 4),
                "snippet": snippet,
            }
        )

    scored.sort(key=lambda item: (-float(item["score"]), str(item["title"])))
    return {"matches": scored[:limit]}
