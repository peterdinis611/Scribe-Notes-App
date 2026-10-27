"""Extract forward-looking next steps, agenda, and upcoming deadlines from notes."""

from __future__ import annotations

import re
from typing import Any

from .commitments import extract_commitments
from .text_utils import normalize_text, split_sentences

_NEXT_STEP_RE = re.compile(
    r"\b("
    r"next\s+steps?|then\s+we|upcoming|what'?s\s+next|follow[- ]?up|"
    r"going\s+forward|moving\s+forward|afterwards|after\s+that|"
    r"nasleduj(?:e|ú|uce)|ďalej|dalej|ďalš(?:í|ie)|dals(?:i|ie)|"
    r"budúc(?:e|i)|buduc(?:e|i)|nasledujúce\s+kroky|dalsie\s+kroky|"
    r"čo\s+ďalej|co\s+dalej|potom\s+treba|treba\s+ešte|treba\s+este"
    r")\b",
    re.IGNORECASE,
)
_AGENDA_RE = re.compile(
    r"(?:^|\n)\s*(?:agenda|next\s+meeting|upcoming\s+meeting|"
    r"nasledujúce\s+stretnutie|nasledujuce\s+stretnutie|"
    r"program\s+stretnutia|body\s+rokovania)\s*[:\-–]\s*(.+?)(?=\n\n|\n[A-ZÁ-Ž]|\Z)",
    re.IGNORECASE | re.DOTALL,
)
_AGENDA_LINE_RE = re.compile(
    r"^\s*(?:[-*•]|\d+[.)])\s+(.+)$",
)
_UPCOMING_RE = re.compile(
    r"\b("
    r"by\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
    r"next\s+week|end\s+of\s+(?:week|month)|eod|eow)|"
    r"due\s+(?:on\s+)?[A-Za-z0-9 ./-]{3,40}|"
    r"deadline|termín|termin|do\s+\d|until\s+\d|"
    r"next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday)|"
    r"budúci\s+(?:týždeň|tyzden|mesiac)|buduci\s+(?:tyzden|mesiac)|"
    r"o\s+týždeň|o\s+tyzden"
    r")\b",
    re.IGNORECASE,
)


def _push(
    items: list[dict[str, Any]],
    seen: set[str],
    raw: str,
    *,
    kind: str,
    due_hint: str | None = None,
    limit: int,
) -> None:
    if len(items) >= limit:
        return
    cleaned = normalize_text(raw)
    if len(cleaned) < 8:
        return
    key = cleaned.lower()
    if key in seen:
        return
    seen.add(key)
    entry: dict[str, Any] = {"text": cleaned, "kind": kind}
    if due_hint:
        entry["dueHint"] = normalize_text(due_hint)
    items.append(entry)


def forward_plan(text: str, *, limit: int = 12) -> dict[str, Any]:
    source = text or ""
    limit = max(1, min(int(limit or 12), 40))
    next_steps: list[dict[str, Any]] = []
    agenda: list[dict[str, Any]] = []
    upcoming: list[dict[str, Any]] = []
    seen: set[str] = set()

    for match in _AGENDA_RE.finditer(source):
        block = match.group(1) or ""
        for line in block.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            line_match = _AGENDA_LINE_RE.match(stripped)
            item_text = line_match.group(1) if line_match else stripped
            _push(agenda, seen, item_text, kind="agenda", limit=limit)

    for sentence in split_sentences(source):
        cleaned = normalize_text(sentence)
        if len(cleaned) < 12:
            continue
        if _NEXT_STEP_RE.search(cleaned):
            _push(next_steps, seen, cleaned, kind="next_step", limit=limit)
        elif _UPCOMING_RE.search(cleaned):
            _push(upcoming, seen, cleaned, kind="upcoming", limit=limit)

    # Commitments with due dates → upcoming / next steps.
    for item in extract_commitments(source, limit=limit).get("commitments") or []:
        text_item = str(item.get("text") or "")
        due = item.get("dueHint")
        if due:
            _push(
                upcoming,
                seen,
                text_item,
                kind="commitment_due",
                due_hint=str(due),
                limit=limit,
            )
        else:
            _push(next_steps, seen, text_item, kind="commitment", limit=limit)

    # Open checklist / task lines (same source meeting notes uses).
    from .tasks import extract_tasks

    for item in extract_tasks(source).get("tasks") or []:
        if item.get("checked"):
            continue
        text_item = str(item.get("text") or "")
        due = item.get("dueHint")
        if due:
            _push(
                upcoming,
                seen,
                text_item,
                kind="action_due",
                due_hint=str(due),
                limit=limit,
            )
        elif text_item:
            _push(next_steps, seen, text_item, kind="action", limit=limit)

    next_steps = next_steps[:limit]
    agenda = agenda[:limit]
    upcoming = upcoming[:limit]
    return {
        "nextSteps": next_steps,
        "agenda": agenda,
        "upcoming": upcoming,
        "counts": {
            "nextSteps": len(next_steps),
            "agenda": len(agenda),
            "upcoming": len(upcoming),
        },
        "source": "python",
    }
