from __future__ import annotations

from .normalize import fold_diacritics
from .text_utils import STOP_WORDS, normalize_text, split_sentences, tokenize

MAX_SENTENCES = 4
MAX_PASSAGES = 12


def library_answer(
    question: str,
    passages: list[dict[str, object]],
    *,
    max_sentences: int = MAX_SENTENCES,
) -> dict[str, object]:
    """Extractive multi-doc answer + citations (no cloud LLM)."""
    query = normalize_text(question)
    if not query:
        return {
            "answer": "Based on your notes: No matching passages were found in your indexed library.",
            "citations": [],
            "sentences": [],
        }

    cleaned: list[dict[str, str]] = []
    for item in passages[:MAX_PASSAGES]:
        if not isinstance(item, dict):
            continue
        document_id = str(item.get("documentId") or item.get("document_id") or "").strip()
        title = normalize_text(str(item.get("title") or ""))
        snippet = normalize_text(str(item.get("snippet") or item.get("text") or ""))
        if not document_id:
            continue
        if not snippet and not title:
            continue
        cleaned.append(
            {
                "documentId": document_id,
                "title": title or "Untitled",
                "snippet": snippet or title,
            }
        )

    query_terms = _query_terms(query)
    sentences = _pick_sentences(query_terms, cleaned, max_sentences=max_sentences)
    answer = _format_answer(sentences)
    citations = [
        {
            "documentId": item["documentId"],
            "title": item["title"],
            "snippet": item["snippet"][:240],
        }
        for item in cleaned
    ]
    return {"answer": answer, "citations": citations, "sentences": sentences}


def _query_terms(question: str) -> set[str]:
    folded = fold_diacritics(question).lower()
    return {
        token
        for token in tokenize(folded)
        if token not in STOP_WORDS and len(token) >= 2
    }


def _pick_sentences(
    query_terms: set[str],
    passages: list[dict[str, str]],
    *,
    max_sentences: int,
) -> list[str]:
    scored: list[tuple[float, str]] = []
    for hit_index, passage in enumerate(passages):
        source = passage["snippet"] or passage["title"]
        parts = split_sentences(source)
        candidates = parts if parts else [source]
        rank_boost = 0.12 / (hit_index + 1)
        for sentence in candidates:
            cleaned = normalize_text(sentence)
            if len(cleaned) < 8:
                continue
            score = _score_sentence(cleaned, query_terms) + rank_boost
            scored.append((score, cleaned))

    scored.sort(key=lambda item: item[0], reverse=True)
    picked: list[str] = []
    for score, sentence in scored:
        if len(picked) >= max_sentences:
            break
        lower = sentence.lower()
        duplicate = any(
            existing.lower() == lower
            or existing.lower().find(lower[: min(48, len(lower))]) >= 0
            or lower.find(existing.lower()[: min(48, len(existing))]) >= 0
            for existing in picked
        )
        if duplicate:
            continue
        if picked and score < 0.12 and scored and scored[0][0] >= 0.2:
            continue
        picked.append(sentence)

    if len(picked) >= 1:
        return picked[:max_sentences]
    return [
        normalize_text(item["snippet"] or item["title"])
        for item in passages
        if (item["snippet"] or item["title"]).strip()
    ][:2]


def _score_sentence(sentence: str, query_terms: set[str]) -> float:
    if not query_terms:
        return 0.0
    tokens = set(tokenize(fold_diacritics(sentence).lower()))
    overlap = 0.0
    for term in query_terms:
        if term in tokens:
            overlap += 1.0
            continue
        if any(term in token or token in term for token in tokens):
            overlap += 0.45
    length_bonus = 0.08 if 40 <= len(sentence) <= 220 else 0.0
    return overlap / len(query_terms) + length_bonus


def _format_answer(sentences: list[str]) -> str:
    if not sentences:
        return "Based on your notes: No matching passages were found in your indexed library."
    if len(sentences) == 1:
        return f"Based on your notes: {sentences[0]}"
    bullets = "\n".join(f"• {sentence}" for sentence in sentences)
    return f"Based on your notes:\n{bullets}"
