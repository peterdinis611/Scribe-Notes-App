"""Citation pack: which notes support a claim (passages + bullets)."""

from __future__ import annotations

import re
from typing import Any

from .text_utils import content_tokens, normalize_text, split_sentences, stem_lite


def citation_pack(
    claim: str,
    documents: list[dict[str, Any]],
    *,
    limit: int = 8,
) -> dict[str, Any]:
    """documents: [{id, title, text, snippet?}, ...] already ranked or raw corpus."""
    query = normalize_text(claim or "")
    limit = max(1, min(int(limit or 8), 20))
    if not query:
        return {
            "claim": "",
            "citations": [],
            "bullets": [],
            "count": 0,
            "source": "python",
        }

    query_stems = {stem_lite(token) for token in content_tokens(query) if len(token) >= 3}
    citations: list[dict[str, Any]] = []

    for doc in documents:
        doc_id = str(doc.get("id") or "")
        title = str(doc.get("title") or "Untitled")
        text = str(doc.get("text") or doc.get("snippet") or "")
        if not text.strip():
            continue
        best_score = 0.0
        best_sentence = ""
        for sentence in split_sentences(text):
            cleaned = normalize_text(sentence)
            if len(cleaned) < 24:
                continue
            stems = {stem_lite(token) for token in content_tokens(cleaned)}
            overlap = len(query_stems & stems)
            if overlap == 0:
                continue
            score = overlap / max(1, len(query_stems))
            # Prefer denser overlap in shorter sentences.
            score += min(0.25, overlap * 0.05)
            if query.lower()[:40] in cleaned.lower():
                score += 0.35
            if score > best_score:
                best_score = score
                best_sentence = cleaned
        if best_score >= 0.2 and best_sentence:
            citations.append(
                {
                    "documentId": doc_id,
                    "title": title,
                    "snippet": best_sentence[:320],
                    "score": round(best_score, 3),
                }
            )

    citations.sort(key=lambda item: item["score"], reverse=True)
    citations = citations[:limit]
    bullets = [
        f"“{item['snippet'][:160]}” — {item['title']}" for item in citations
    ]
    return {
        "claim": query,
        "citations": citations,
        "bullets": bullets,
        "count": len(citations),
        "source": "python",
    }
