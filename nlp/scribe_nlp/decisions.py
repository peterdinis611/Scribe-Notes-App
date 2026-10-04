"""Extract decision log entries from notes / meeting minutes."""

from __future__ import annotations

import re
from typing import Any

from .text_utils import normalize_text, split_sentences

_DECISION_RE = re.compile(
    r"\b("
    r"decid(?:ed|e|es|ing)|decision|agreed|agreement|approved|resolved|"
    r"we\s+will|we'll|going\s+with|chose|chosen|final(?:ized)?|"
    r"rozhod(?:li|núť|nutie|uje)|dohodli|schválili|odsúhlasili|uzavreli"
    r")\b",
    re.IGNORECASE,
)
_OWNER_RE = re.compile(
    r"\b(?:owner|assignee|zodpovedá|vlastník)\s*[:\-–]\s*([^\n,;]+)",
    re.IGNORECASE,
)
_STATUS_RE = re.compile(
    r"\b(pending|open|done|blocked|approved|rejected|"
    r"otvorené|schválené|zamietnuté|blokované)\b",
    re.IGNORECASE,
)


def extract_decisions(text: str, *, limit: int = 12) -> dict[str, Any]:
    source = text or ""
    limit = max(1, min(int(limit or 12), 40))

    decisions: list[dict[str, Any]] = []
    seen: set[str] = set()

    for sentence in split_sentences(source):
        cleaned = normalize_text(sentence)
        if len(cleaned) < 18:
            continue
        if not _DECISION_RE.search(cleaned):
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        owner_match = _OWNER_RE.search(cleaned)
        status_match = _STATUS_RE.search(cleaned)
        decisions.append(
            {
                "text": cleaned,
                "kind": "decision",
                "owner": normalize_text(owner_match.group(1)) if owner_match else None,
                "status": status_match.group(1).lower() if status_match else None,
            }
        )
        if len(decisions) >= limit:
            break

    # Also harvest explicit "Decision:" / "Rozhodnutie:" lines
    for line in source.splitlines():
        stripped = line.strip()
        label = re.match(
            r"^(?:decision|rozhodnutie|agreed|dohoda)\s*[:\-–]\s*(.+)$",
            stripped,
            re.IGNORECASE,
        )
        if not label:
            continue
        cleaned = normalize_text(label.group(1))
        if len(cleaned) < 8:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        decisions.append({"text": cleaned, "kind": "labeled", "owner": None, "status": None})
        if len(decisions) >= limit:
            break

    return {
        "decisions": decisions[:limit],
        "count": len(decisions[:limit]),
        "source": "python",
    }
