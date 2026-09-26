"""Extract study flashcards (Q&A + cloze) from local note text."""

from __future__ import annotations

import re
from typing import Any

from .text_utils import normalize_text, split_sentences

_QA_RE = re.compile(
    r"^\s*(?:q(?:uestion)?|otázka)\s*[:.\-–]\s*(.+)$",
    re.IGNORECASE,
)
_ANS_RE = re.compile(
    r"^\s*(?:a(?:nswer)?|odpoveď|odpoved)\s*[:.\-–]\s*(.+)$",
    re.IGNORECASE,
)
_DEF_RE = re.compile(
    r"^(.{3,80}?)\s+(?:is|are|means|je|sú|znamená)\s+(.{8,200})$",
    re.IGNORECASE,
)
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)


def extract_flashcards(
    text: str,
    *,
    limit: int = 12,
    include_cloze: bool = True,
) -> dict[str, Any]:
    source = text or ""
    limit = max(1, min(int(limit or 12), 40))
    cards: list[dict[str, Any]] = []
    seen: set[str] = set()

    lines = source.splitlines()
    pending_q: str | None = None
    for line in lines:
        q_match = _QA_RE.match(line)
        if q_match:
            pending_q = normalize_text(q_match.group(1))
            continue
        a_match = _ANS_RE.match(line)
        if a_match and pending_q:
            answer = normalize_text(a_match.group(1))
            _push_card(cards, seen, "qa", pending_q, answer, pending_q)
            pending_q = None
            if len(cards) >= limit:
                break

    if len(cards) < limit:
        for sentence in split_sentences(source):
            if len(cards) >= limit:
                break
            cleaned = normalize_text(sentence)
            if len(cleaned) < 20:
                continue
            def_match = _DEF_RE.match(cleaned.rstrip("."))
            if def_match:
                term = normalize_text(def_match.group(1))
                meaning = normalize_text(def_match.group(2))
                if len(term.split()) <= 8:
                    _push_card(
                        cards,
                        seen,
                        "definition",
                        f"What is {term}?" if not _looks_slovak(source) else f"Čo je {term}?",
                        meaning,
                        cleaned,
                    )

    if include_cloze and len(cards) < limit:
        for sentence in split_sentences(source):
            if len(cards) >= limit:
                break
            cleaned = normalize_text(sentence)
            words = cleaned.split()
            if not (8 <= len(words) <= 28):
                continue
            # Cloze the longest content-ish token.
            candidates = sorted(
                (w for w in words if len(w) >= 6 and w[0].isalpha()),
                key=len,
                reverse=True,
            )
            if not candidates:
                continue
            target = candidates[0]
            question = cleaned.replace(target, "____", 1)
            if question == cleaned:
                continue
            _push_card(cards, seen, "cloze", question, target, cleaned)

    if len(cards) < max(2, limit // 3):
        for match in _HEADING_RE.finditer(source):
            if len(cards) >= limit:
                break
            title = normalize_text(match.group(2))
            if len(title) < 3:
                continue
            # Pull the following paragraph as answer.
            start = match.end()
            chunk = source[start : start + 400]
            para = next((p.strip() for p in chunk.split("\n\n") if len(p.strip()) > 20), "")
            if not para:
                continue
            prompt = (
                f"Summarize section “{title}”"
                if not _looks_slovak(source)
                else f"Zhrň sekciu „{title}“"
            )
            _push_card(cards, seen, "section", prompt, normalize_text(para)[:280], title)

    return {
        "cards": cards[:limit],
        "count": min(len(cards), limit),
        "source": "python",
    }


def _push_card(
    cards: list[dict[str, Any]],
    seen: set[str],
    kind: str,
    question: str,
    answer: str,
    front: str,
) -> None:
    key = f"{kind}:{question.lower()}:{answer.lower()}"
    if key in seen or not question or not answer:
        return
    seen.add(key)
    cards.append(
        {
            "kind": kind,
            "question": question,
            "answer": answer,
            "front": front,
        }
    )


def _looks_slovak(text: str) -> bool:
    sample = (text or "")[:3000].lower()
    return sum(1 for token in (" že ", " nie ", " alebo ", " pre ") if token in sample) >= 2
