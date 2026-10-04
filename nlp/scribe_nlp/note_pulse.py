"""Compact note health pulse for the Librarian agent (stdlib only)."""

from __future__ import annotations

from typing import Any

from .dates import extract_dates
from .pii import detect_pii
from .readability import reading_stats
from .tasks import extract_tasks
from .text_utils import normalize_text


def note_pulse(text: str) -> dict[str, Any]:
    source = text or ""
    tasks = extract_tasks(source)
    open_tasks = [
        item
        for item in (tasks.get("tasks") or [])
        if isinstance(item, dict) and not item.get("checked")
    ]
    dates = extract_dates(source)
    events = [e for e in (dates.get("events") or []) if isinstance(e, dict)]
    stats = reading_stats(source) if source.strip() else {}
    pii = detect_pii(source, limit=12) if source.strip() else {"count": 0, "risk": "low"}

    word_count = int(stats.get("wordCount") or stats.get("words") or 0)
    if not word_count and source.strip():
        word_count = len(source.split())

    hints: list[str] = []
    if len(open_tasks) >= 5:
        hints.append("many_open_tasks")
    if len(events) >= 3:
        hints.append("dense_dates")
    if int(pii.get("count") or 0) > 0:
        hints.append("pii_present")
    if word_count < 40:
        hints.append("thin_note")
    elif word_count > 2500:
        hints.append("long_note")

    score = 70
    score -= min(20, len(open_tasks) * 2)
    score -= min(15, int(pii.get("count") or 0) * 3)
    if word_count < 40:
        score -= 15
    if "long_note" in hints:
        score -= 5
    score = max(0, min(100, score))

    summary_bits = [
        f"{len(open_tasks)} open tasks",
        f"{len(events)} date hints",
        f"PII risk {pii.get('risk') or 'low'}",
        f"{word_count} words",
    ]

    return {
        "score": score,
        "summary": normalize_text("; ".join(summary_bits)),
        "openTaskCount": len(open_tasks),
        "dateCount": len(events),
        "wordCount": word_count,
        "piiRisk": pii.get("risk") or "low",
        "piiCount": int(pii.get("count") or 0),
        "hints": hints,
        "source": "python",
    }
