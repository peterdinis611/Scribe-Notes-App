"""Rank open tasks by local urgency / importance signals."""

from __future__ import annotations

import re
from typing import Any

from .dates import extract_dates
from .tasks import extract_tasks
from .text_utils import normalize_text

_URGENT_RE = re.compile(
    r"\b(urgent|asap|critical|blocker|p0|p1|high priority|"
    r"urgentné|kritické|ihneď|hned|dnes|today|tomorrow|zajtra)\b",
    re.IGNORECASE,
)
_LOW_RE = re.compile(
    r"\b(someday|later|nice to have|low priority|optional|"
    r"niekedy|neskôr|voliteľné|low)\b",
    re.IGNORECASE,
)


def rank_tasks(text: str, *, limit: int = 20) -> dict[str, Any]:
    source = text or ""
    limit = max(1, min(int(limit or 20), 50))

    extracted = extract_tasks(source)
    raw_tasks = list(extracted.get("tasks") or [])
    dates = extract_dates(source)
    events = list(dates.get("events") or []) if isinstance(dates, dict) else []

    ranked: list[dict[str, Any]] = []
    for task in raw_tasks:
        if not isinstance(task, dict):
            continue
        if task.get("checked"):
            continue
        text_item = normalize_text(str(task.get("text") or ""))
        if not text_item:
            continue
        score = 1.0
        reasons: list[str] = []
        due = task.get("dueHint")
        if due:
            score += 2.0
            reasons.append("has_due")
        if _URGENT_RE.search(text_item):
            score += 2.5
            reasons.append("urgent_language")
        if _LOW_RE.search(text_item):
            score -= 1.2
            reasons.append("low_priority_language")
        # Boost when a date event overlaps the task text
        lower = text_item.lower()
        for event in events[:12]:
            if not isinstance(event, dict):
                continue
            snippet = str(event.get("text") or event.get("raw") or "").lower()
            if snippet and (snippet in lower or lower in snippet):
                score += 1.2
                reasons.append("linked_date")
                break
        if task.get("source") == "checkbox":
            score += 0.3
        ranked.append(
            {
                "text": text_item,
                "dueHint": due,
                "kind": task.get("kind") or task.get("source") or "task",
                "score": round(score, 3),
                "reasons": reasons,
            }
        )

    ranked.sort(key=lambda item: float(item["score"]), reverse=True)
    trimmed = ranked[:limit]
    return {
        "tasks": trimmed,
        "count": len(trimmed),
        "source": "python",
    }
