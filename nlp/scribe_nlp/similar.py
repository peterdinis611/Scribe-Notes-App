from __future__ import annotations

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
) -> dict[str, object]:
    """Rank notes by keyword / content-token overlap (no embeddings required)."""
    query = normalize_text(query_text)
    if not query or not documents:
        return {"matches": []}

    query_tokens = set(content_tokens(query))
    query_keywords = {
        str(item.get("term") or "")
        for item in (extract_keywords(query, limit=16).get("keywords") or [])
    }
    limit = max(1, min(int(limit or 8), 32))

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
