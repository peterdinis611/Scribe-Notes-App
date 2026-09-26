"""Quiz questions derived from document outline / headings."""

from __future__ import annotations

import re
from typing import Any

from .text_utils import normalize_text

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
_NUMBERED_RE = re.compile(r"^\s*(\d+)[.)]\s+(.+)$")


def outline_quiz(text: str, *, limit: int = 12) -> dict[str, Any]:
    source = text or ""
    limit = max(1, min(int(limit or 12), 40))
    slovak = _looks_slovak(source)
    headings: list[tuple[int, str]] = []

    for match in _HEADING_RE.finditer(source):
        level = len(match.group(1))
        title = normalize_text(match.group(2))
        if len(title) >= 3:
            headings.append((level, title))

    if len(headings) < 2:
        for line in source.splitlines():
            match = _NUMBERED_RE.match(line)
            if match:
                title = normalize_text(match.group(2))
                if len(title) >= 3:
                    headings.append((2, title))

    questions: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, (level, title) in enumerate(headings):
        if len(questions) >= limit:
            break
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        prompt = (
            f"Čo obsahuje sekcia „{title}“?"
            if slovak
            else f"What does the section “{title}” cover?"
        )
        # Pull following paragraph as hint/answer seed.
        start = source.lower().find(title.lower())
        answer = ""
        if start >= 0:
            chunk = source[start + len(title) : start + len(title) + 420]
            para = next((p.strip() for p in chunk.split("\n\n") if len(p.strip()) > 24), "")
            answer = normalize_text(para)[:280]
        if not answer:
            siblings = [h for i, (_, h) in enumerate(headings) if i != index][:3]
            answer = (
                "Súvisiace: " + ", ".join(siblings)
                if slovak and siblings
                else ("Related: " + ", ".join(siblings) if siblings else title)
            )
        questions.append(
            {
                "kind": "outline",
                "level": level,
                "section": title,
                "question": prompt,
                "answer": answer,
            }
        )

    return {
        "questions": questions[:limit],
        "count": min(len(questions), limit),
        "headingCount": len(headings),
        "source": "python",
    }


def _looks_slovak(text: str) -> bool:
    sample = (text or "")[:3000].lower()
    return sum(1 for token in (" že ", " nie ", " alebo ", " pre ") if token in sample) >= 2
