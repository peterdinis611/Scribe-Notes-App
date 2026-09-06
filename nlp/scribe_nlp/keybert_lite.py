from __future__ import annotations

from .embed import cosine_similarity, embed_text
from .embed_backend import active_backend, quality_available
from .keywords import extract_keywords
from .text_utils import truncate_text


def keybert_keywords(text: str, limit: int = 12) -> dict[str, object] | None:
    """Rank TF candidates by similarity to the document embedding (quality path)."""
    if active_backend() != "quality" or not quality_available():
        return None

    source = truncate_text(text or "", 12_000)
    if len(source.strip()) < 40:
        return None

    base = extract_keywords(source, limit=max(limit * 3, 24))
    candidates = [
        str(item.get("term") or "")
        for item in (base.get("keywords") or [])
        if item.get("term")
    ]
    phrases = [
        str(item.get("phrase") or "")
        for item in (base.get("keyphrases") or [])
        if item.get("phrase")
    ]
    pool = []
    seen: set[str] = set()
    for item in candidates + phrases:
        key = item.lower()
        if len(item) < 3 or key in seen:
            continue
        seen.add(key)
        pool.append(item)
    if not pool:
        return None

    doc_vec = embed_text(source)
    scored: list[tuple[str, float]] = []
    for candidate in pool:
        score = cosine_similarity(doc_vec, embed_text(candidate))
        scored.append((candidate, score))
    scored.sort(key=lambda item: (-item[1], item[0]))

    keywords = [
        {"term": term, "score": round(score, 5), "count": 1}
        for term, score in scored[:limit]
        if " " not in term
    ]
    keyphrases = [
        {"phrase": term, "count": 1}
        for term, _score in scored
        if " " in term
    ][: max(4, limit // 2)]

    return {
        "keywords": keywords,
        "keyphrases": keyphrases,
        "backend": "keybert-lite",
    }
