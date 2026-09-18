from __future__ import annotations

from .normalize import fold_diacritics, stem_lite
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
    answer = _format_answer(sentences, prefix=prefix)
    citations = [
        {
            "documentId": item["documentId"],
            "title": item["title"],
            "snippet": item["snippet"][:240],
        }
        for item in cleaned
    ]
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
        title = (passage.get("title") or "").lower()
        if "chat memory" in title or "earlier chat" in title:
            rank_boost += 0.22
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
