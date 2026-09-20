from __future__ import annotations

from typing import Any

from .normalize import fold_diacritics, stem_lite
from .rerank import rerank_passages
from .text_utils import STOP_WORDS, normalize_text, split_sentences, tokenize

MAX_SENTENCES = 4
MAX_PASSAGES = 24
MAX_FOLLOWUPS = 4


def library_answer(
    question: str,
    passages: list[dict[str, object]],
    *,
    max_sentences: int = MAX_SENTENCES,
    scope: str = "library",
) -> dict[str, object]:
    """Extractive multi-doc answer + citations (no cloud LLM)."""
    query = normalize_text(question)
    prefix = (
        "Based on this document"
        if scope == "document"
        else "Based on your notes"
    )
    if not query:
        return {
            "answer": f"{prefix}: No matching passages were found.",
            "citations": [],
            "sentences": [],
            "followups": [],
        }

    cleaned: list[dict[str, Any]] = []
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
        entry: dict[str, Any] = {
            "documentId": document_id,
            "title": title or "Untitled",
            "snippet": snippet or title,
        }
        if item.get("score") is not None:
            entry["score"] = item.get("score")
        chunk_index = item.get("chunkIndex", item.get("chunk_index"))
        if chunk_index is not None:
            try:
                entry["chunkIndex"] = int(chunk_index)
            except (TypeError, ValueError):
                pass
        cleaned.append(entry)

    cleaned = rerank_passages(question, cleaned, limit=MAX_PASSAGES)
    query_terms = _query_terms(query)
    sentences, used = _pick_sentences(query_terms, cleaned, max_sentences=max_sentences)
    answer = _format_answer(sentences, prefix=prefix)
    citations = []
    seen_ids: set[str] = set()
    for item in used:
        document_id = item["documentId"]
        title = item.get("title") or "Untitled"
        if "chat memory" in title.lower() or "earlier chat" in title.lower() or "library memory" in title.lower() or "note memory" in title.lower():
            continue
        if document_id in seen_ids:
            continue
        seen_ids.add(document_id)
        cite: dict[str, Any] = {
            "documentId": document_id,
            "title": title,
            "snippet": item["snippet"][:240],
        }
        if item.get("chunkIndex") is not None:
            cite["chunkIndex"] = item["chunkIndex"]
        citations.append(cite)
        if len(citations) >= 4:
            break
    followups = suggest_followups(question, sentences, cleaned, scope=scope)
    return {
        "answer": answer,
        "citations": citations,
        "sentences": sentences,
        "followups": followups,
    }


def suggest_followups(
    question: str,
    sentences: list[str],
    passages: list[dict[str, str]],
    *,
    scope: str = "library",
    limit: int = MAX_FOLLOWUPS,
) -> list[str]:
    """Heuristic follow-up questions from answer sentences / passage titles (offline)."""
    limit = max(1, min(int(limit), 8))
    asked = {stem_lite(token) for token in tokenize(fold_diacritics(question).lower())}
    candidates: list[str] = []

    for sentence in sentences:
        for cue in ("because", "pretože", "lebo", "when", "keď", "ak ", "if "):
            if cue in sentence.lower() and len(sentence) >= 24:
                candidates.append(f"What else is known about: {sentence[:96].rstrip('.')}?")
                break

    titles = []
    for item in passages:
        title = (item.get("title") or "").strip()
        if not title or "· chat memory" in title:
            continue
        titles.append(title)

    for title in titles[:6]:
        stems = {stem_lite(token) for token in tokenize(fold_diacritics(title).lower())}
        if stems and stems.isdisjoint(asked):
            if scope == "document":
                candidates.append(f"Where in this note is {title} explained?")
            else:
                candidates.append(f"What do my notes say about {title}?")

    if scope == "document":
        candidates.append("What are the key action items in this document?")
        candidates.append("Which dates or deadlines are mentioned?")
    else:
        candidates.append("Which related notes should I open next?")
        candidates.append("Are there open tasks connected to this?")

    seen: set[str] = set()
    picked: list[str] = []
    for item in candidates:
        key = fold_diacritics(item).lower()
        if key in seen:
            continue
        seen.add(key)
        picked.append(item)
        if len(picked) >= limit:
            break
    return picked


def _query_terms(question: str) -> set[str]:
    folded = fold_diacritics(question).lower()
    return {
        token
        for token in tokenize(folded)
        if token not in STOP_WORDS and len(token) >= 2
    }


def _pick_sentences(
    query_terms: set[str],
    passages: list[dict[str, Any]],
    *,
    max_sentences: int,
) -> tuple[list[str], list[dict[str, Any]]]:
    scored: list[tuple[float, str, dict[str, Any]]] = []
    for hit_index, passage in enumerate(passages):
        source = passage["snippet"] or passage["title"]
        parts = split_sentences(source)
        candidates = parts if parts else [source]
        rank_boost = 0.12 / (hit_index + 1)
        title = (passage.get("title") or "").lower()
        if "chat memory" in title or "earlier chat" in title or "library memory" in title or "note memory" in title:
            rank_boost += 0.08
        try:
            rank_boost += min(0.35, max(0.0, float(passage.get("score") or 0))) * 0.25
        except (TypeError, ValueError):
            pass
        for sentence in candidates:
            cleaned = normalize_text(sentence)
            if len(cleaned) < 8 or _is_noisy_sentence(cleaned):
                continue
            score = _score_sentence(cleaned, query_terms) + rank_boost
            scored.append((score, cleaned, passage))

    scored.sort(key=lambda item: item[0], reverse=True)
    picked: list[str] = []
    used: list[dict[str, Any]] = []
    for score, sentence, passage in scored:
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
        used.append(passage)

    if len(picked) >= 1:
        return picked[:max_sentences], used

    fallback: list[str] = []
    fallback_used: list[dict[str, Any]] = []
    for item in passages:
        text = normalize_text(item["snippet"] or item["title"])
        if not text.strip() or _is_noisy_sentence(text):
            continue
        fallback.append(text)
        fallback_used.append(item)
        if len(fallback) >= 2:
            break
    return fallback, fallback_used


def _is_noisy_sentence(sentence: str) -> bool:
    stripped = sentence.strip()
    if stripped.count("|") >= 2 or "\t\t" in stripped:
        return True
    if set(stripped) <= {"|", "-", ":", " "}:
        return True
    letters = sum(1 for char in stripped if char.isalpha())
    digits = sum(1 for char in stripped if char.isdigit())
    if len(stripped) >= 24 and digits > letters and digits / max(len(stripped), 1) >= 0.35:
        return True
    return False


def _score_sentence(sentence: str, query_terms: set[str]) -> float:
    if not query_terms:
        return 0.0
    tokens = set(tokenize(fold_diacritics(sentence).lower()))
    token_stems = {stem_lite(token) for token in tokens}
    overlap = 0.0
    for term in query_terms:
        term_stem = stem_lite(term)
        if term in tokens:
            overlap += 1.0
            continue
        if term_stem in token_stems:
            overlap += 0.85
            continue
        if any(term in token or token in term for token in tokens):
            overlap += 0.45
            continue
        if any(
            term_stem in stem or stem in term_stem
            for stem in token_stems
            if len(stem) >= 4 and len(term_stem) >= 4
        ):
            overlap += 0.35
    length_bonus = 0.08 if 40 <= len(sentence) <= 220 else 0.0
    return overlap / len(query_terms) + length_bonus


def _format_answer(sentences: list[str], *, prefix: str = "Based on your notes") -> str:
    if not sentences:
        return f"{prefix}: No matching passages were found."
    if len(sentences) == 1:
        return f"{prefix}: {sentences[0]}"
    bullets = "\n".join(f"• {sentence}" for sentence in sentences)
    return f"{prefix}:\n{bullets}"
