from __future__ import annotations

from .keywords import extract_keywords
from .normalize import fold_diacritics
from .text_utils import (
    CAP_PHRASE_RE,
    WIKI_LINK_RE,
    content_stems,
    jaccard_similarity,
    normalize_text,
)

MAX_CANDIDATES = 2_000
MAX_SUGGESTIONS = 12
MIN_PHRASE_LEN = 3


def suggest_wiki_links(
    text: str,
    documents: list[dict[str, object]],
    *,
    limit: int = 8,
    exclude_document_id: str | None = None,
) -> dict[str, object]:
    """Suggest wiki targets for phrases in the note that match other note titles."""
    source = normalize_text(text)
    if not source or not documents:
        return {"suggestions": [], "count": 0}

    limit = max(1, min(int(limit or 8), MAX_SUGGESTIONS))
    existing_links = {
        fold_diacritics(match.group(1)).lower().strip()
        for match in WIKI_LINK_RE.finditer(source)
    }

    phrases = _candidate_phrases(source)
    if not phrases:
        return {"suggestions": [], "count": 0}

    docs: list[tuple[str, str, str, set[str]]] = []
    for document in documents[:MAX_CANDIDATES]:
        doc_id = str(document.get("id") or "").strip()
        title = normalize_text(str(document.get("title") or ""))
        if not doc_id or not title:
            continue
        if exclude_document_id and doc_id == exclude_document_id:
            continue
        folded_title = fold_diacritics(title).lower()
        if folded_title in existing_links:
            continue
        docs.append((doc_id, title, folded_title, set(content_stems(title))))

    if not docs:
        return {"suggestions": [], "count": 0}

    scored: list[dict[str, object]] = []
    seen_targets: set[str] = set()

    for phrase in phrases:
        folded_phrase = fold_diacritics(phrase).lower()
        phrase_stems = set(content_stems(phrase))
        if len(folded_phrase) < MIN_PHRASE_LEN:
            continue

        best: tuple[float, str, str] | None = None
        for doc_id, title, folded_title, title_stems in docs:
            if doc_id in seen_targets:
                continue
            score = _match_score(folded_phrase, phrase_stems, folded_title, title_stems)
            if score < 0.55:
                continue
            if best is None or score > best[0]:
                best = (score, doc_id, title)

        if best is None:
            continue
        score, doc_id, title = best
        seen_targets.add(doc_id)
        scored.append(
            {
                "phrase": phrase,
                "documentId": doc_id,
                "title": title,
                "score": round(score, 4),
                "reason": "title_match",
            }
        )

    scored.sort(key=lambda item: float(item.get("score") or 0), reverse=True)
    suggestions = scored[:limit]
    return {"suggestions": suggestions, "count": len(suggestions)}


def _candidate_phrases(text: str) -> list[str]:
    phrases: list[str] = []
    seen: set[str] = set()

    def _push(raw: str) -> None:
        value = normalize_text(raw)
        key = fold_diacritics(value).lower()
        if len(key) < MIN_PHRASE_LEN or key in seen:
            return
        seen.add(key)
        phrases.append(value)

    for match in CAP_PHRASE_RE.finditer(text):
        _push(match.group(1))

    for item in extract_keywords(text, limit=16).get("keywords") or []:
        term = str(item.get("term") or "")
        if " " in term or len(term) >= 5:
            _push(term)

    # Single capitalized tokens (names / projects).
    for token in text.split():
        cleaned = token.strip(".,;:!?()[]\"'")
        if len(cleaned) < 4:
            continue
        if cleaned[0].isupper() and cleaned[1:].islower():
            _push(cleaned)

    return phrases[:48]


def _match_score(
    folded_phrase: str,
    phrase_stems: set[str],
    folded_title: str,
    title_stems: set[str],
) -> float:
    if folded_phrase == folded_title:
        return 1.0
    if folded_phrase in folded_title or folded_title in folded_phrase:
        shorter = min(len(folded_phrase), len(folded_title))
        longer = max(len(folded_phrase), len(folded_title))
        return 0.72 + 0.2 * (shorter / max(longer, 1))

    if not phrase_stems or not title_stems:
        return 0.0

    overlap = len(phrase_stems & title_stems) / max(len(phrase_stems | title_stems), 1)
    if overlap <= 0:
        # Soft stem containment (SK morphology lite).
        soft = 0
        for stem in phrase_stems:
            if any(stem in other or other in stem for other in title_stems):
                soft += 1
        overlap = 0.45 * (soft / max(len(phrase_stems), 1))

    # Tiny lexical Jaccard on surface strings as tie-break.
    surface = jaccard_similarity(folded_phrase, folded_title)
    return 0.75 * overlap + 0.25 * surface
