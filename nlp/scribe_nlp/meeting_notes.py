"""Meeting-notes pack: decisions, action items, attendees in one pass."""

from __future__ import annotations

import re
from typing import Any

from .text_utils import normalize_text, split_sentences
from .tasks import extract_tasks

_DECISION_RE = re.compile(
    r"\b(decid(?:ed|e|es|ing)|decision|agreed|agreement|we will|we'll|"
    r"rozhod(?:li|núť|nutie)|dohodli|schválili)\b",
    re.IGNORECASE,
)
_ATTENDEE_LINE_RE = re.compile(
    r"^\s*(?:attendees?|participants?|present|účastn[ií]ci|pritomní)\s*[:\-–]\s*(.+)$",
    re.IGNORECASE,
)
_MENTION_RE = re.compile(r"@([A-Za-zÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][\w.\-]{1,40})")
_NAME_RE = re.compile(
    r"\b([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž]+(?:\s+[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž]+){0,2})\b"
)


def meeting_notes_pack(text: str, *, limit: int = 12) -> dict[str, Any]:
    source = text or ""
    limit = max(1, min(int(limit or 12), 30))

    decisions: list[dict[str, Any]] = []
    for sentence in split_sentences(source):
        cleaned = normalize_text(sentence)
        if len(cleaned) < 20:
            continue
        if _DECISION_RE.search(cleaned):
            decisions.append({"text": cleaned, "kind": "decision"})
        if len(decisions) >= limit:
            break

    tasks = extract_tasks(source)
    action_items = []
    for item in tasks.get("tasks") or []:
        if item.get("checked"):
            continue
        action_items.append(
            {
                "text": item.get("text") or "",
                "dueHint": item.get("dueHint"),
                "source": item.get("source") or "task",
            }
        )
        if len(action_items) >= limit:
            break

    attendees: list[str] = []
    seen: set[str] = set()
    for line in source.splitlines():
        match = _ATTENDEE_LINE_RE.match(line)
        if match:
            for part in re.split(r"[,;/]| a | and ", match.group(1)):
                name = normalize_text(part)
                key = name.lower()
                if len(name) >= 2 and key not in seen:
                    seen.add(key)
                    attendees.append(name)
    for match in _MENTION_RE.finditer(source):
        name = match.group(1)
        key = name.lower()
        if key not in seen:
            seen.add(key)
            attendees.append(name)
    if len(attendees) < 2:
        # Light heuristic: capitalized names near the top.
        head = "\n".join(source.splitlines()[:12])
        for match in _NAME_RE.finditer(head):
            name = match.group(1)
            if name.lower() in {"monday", "tuesday", "wednesday", "thursday", "friday", "scribe"}:
                continue
            key = name.lower()
            if key not in seen and " " in name:
                seen.add(key)
                attendees.append(name)
            if len(attendees) >= 8:
                break

    return {
        "decisions": decisions[:limit],
        "actionItems": action_items[:limit],
        "attendees": attendees[:16],
        "counts": {
            "decisions": min(len(decisions), limit),
            "actionItems": min(len(action_items), limit),
            "attendees": min(len(attendees), 16),
        },
        "source": "python",
    }
