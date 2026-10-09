"""Extract personal / team commitments (“I will…”, “we commit…”) from notes."""

from __future__ import annotations

import re
from typing import Any

from .text_utils import normalize_text, split_sentences

_COMMIT_RE = re.compile(
    r"\b("
    r"i\s+will|i'll|we\s+will|we'll|we\s+commit|committed\s+to|promise\s+to|"
    r"take\s+ownership|own(?:ing|ed)?\s+this|follow\s+up|"
    r"zaviaž(?:em|e)|zaväzuj(?:em|e)|sľubuj(?:em|e)|budem|budeme|"
    r"zoberiem\s+na\s+seba|dopracujem|doručím"
    r")\b",
    re.IGNORECASE,
)
_LABELED_RE = re.compile(
    r"(?:^|\n)\s*(?:commitment|commit|follow[- ]?up|záväzok|slub|sľub)\s*[:\-–]\s*(.+?)(?=\n|$)",
    re.IGNORECASE,
)
_INLINE_LABELED_RE = re.compile(
    r"\b(?:commitment|commit|follow[- ]?up|záväzok|slub|sľub)\s*[:\-–]\s*([^.\n]{8,180})",
    re.IGNORECASE,
)
_OWNER_RE = re.compile(
    r"\b(?:owner|assignee|zodpovedá|vlastník|@([\w.\-]+))\s*[:\-–]?\s*([^\n,;]+)?",
    re.IGNORECASE,
)
_DUE_RE = re.compile(
    r"\b(?:by|before|until|do|do\s+dňa|termín)\s+([A-Za-zÁ-Žá-ž0-9 ./-]{3,40})",
    re.IGNORECASE,
)


def extract_commitments(text: str, *, limit: int = 12) -> dict[str, Any]:
    source = text or ""
    limit = max(1, min(int(limit or 12), 40))
    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    def push(raw: str, *, kind: str) -> None:
        cleaned = normalize_text(raw)
        if len(cleaned) < 12:
            return
        key = cleaned.lower()
        if key in seen:
            return
        seen.add(key)
        owner_match = _OWNER_RE.search(cleaned)
        due_match = _DUE_RE.search(cleaned)
        owner = None
        if owner_match:
            owner = normalize_text(owner_match.group(1) or owner_match.group(2) or "")
            if not owner:
                owner = None
        items.append(
            {
                "text": cleaned,
                "kind": kind,
                "owner": owner,
                "dueHint": normalize_text(due_match.group(1)) if due_match else None,
            }
        )

    for sentence in split_sentences(source):
        cleaned = normalize_text(sentence)
        if len(cleaned) < 16:
            continue
        if _COMMIT_RE.search(cleaned):
            push(cleaned, kind="commitment")
            if len(items) >= limit:
                break

    for match in _INLINE_LABELED_RE.finditer(source):
        if len(items) >= limit:
            break
        push(match.group(1), kind="labeled")

    for match in _LABELED_RE.finditer(source):
        if len(items) >= limit:
            break
        push(match.group(1), kind="labeled")

    trimmed = items[:limit]
    return {
        "commitments": trimmed,
        "count": len(trimmed),
        "source": "python",
    }
