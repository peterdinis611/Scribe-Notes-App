from __future__ import annotations

import re
from datetime import date, timedelta

from .text_utils import normalize_text

ABSOLUTE_DATE = re.compile(
    r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)\b"
)
RELATIVE = re.compile(
    r"(?i)\b("
    r"dnes|today|"
    r"zajtra|tomorrow|"
    r"pozajtra|"
    r"včera|vcera|yesterday|"
    r"budúci\s+(?:týždeň|tyzden|mesiac)|next\s+(?:week|month)|"
    r"tento\s+(?:týždeň|tyzden)|this\s+week|"
    r"budúci\s+(?:pondelok|utorok|streda|štvrtok|stvrtok|piatok|sobota|nedeľa|nedela)|"
    r"next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
    r")\b"
)
DEADLINE = re.compile(
    r"(?i)\b(?:do|until|by|deadline)\s+(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|\d{4}-\d{2}-\d{2})\b"
)

WEEKDAYS_SK = {
    "pondelok": 0,
    "utorok": 1,
    "streda": 2,
    "štvrtok": 3,
    "stvrtok": 3,
    "piatok": 4,
    "sobota": 5,
    "nedeľa": 6,
    "nedela": 6,
}
WEEKDAYS_EN = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


def extract_dates(
    text: str,
    *,
    today: date | None = None,
) -> dict[str, object]:
    """Absolute + relative date/event cues for tasks and journal timeline."""
    source = text or ""
    base = today or date.today()
    events: list[dict[str, object]] = []
    seen: set[str] = set()

    def _add(raw: str, kind: str, resolved: date | None = None) -> None:
        key = f"{kind}:{raw.lower()}:{resolved.isoformat() if resolved else ''}"
        if key in seen:
            return
        seen.add(key)
        events.append(
            {
                "text": normalize_text(raw),
                "kind": kind,
                "resolvedDate": resolved.isoformat() if resolved else None,
            }
        )

    for match in ABSOLUTE_DATE.finditer(source):
        raw = match.group(1)
        _add(raw, "absolute", _parse_absolute(raw, base.year))

    for match in DEADLINE.finditer(source):
        raw = match.group(1)
        _add(f"do {raw}", "deadline", _parse_absolute(raw, base.year))

    for match in RELATIVE.finditer(source):
        raw = match.group(1)
        _add(raw, "relative", _resolve_relative(raw.lower(), base))

    events.sort(
        key=lambda item: (
            item.get("resolvedDate") is None,
            str(item.get("resolvedDate") or "9999"),
            str(item.get("text") or ""),
        )
    )
    return {"events": events, "count": len(events)}


def _parse_absolute(raw: str, default_year: int) -> date | None:
    value = raw.strip()
    try:
        if "-" in value and len(value) >= 8:
            return date.fromisoformat(value[:10])
        parts = re.split(r"[./]", value)
        if len(parts) == 2:
            day, month = int(parts[0]), int(parts[1])
            return date(default_year, month, day)
        if len(parts) == 3:
            day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
            if year < 100:
                year += 2000
            return date(year, month, day)
    except ValueError:
        return None
    return None


def _resolve_relative(raw: str, base: date) -> date | None:
    text = re.sub(r"\s+", " ", raw.strip().lower())
    if text in {"dnes", "today"}:
        return base
    if text in {"zajtra", "tomorrow"}:
        return base + timedelta(days=1)
    if text == "pozajtra":
        return base + timedelta(days=2)
    if text in {"včera", "vcera", "yesterday"}:
        return base - timedelta(days=1)
    if "budúci týždeň" in text or "buduci tyzden" in text or text == "next week":
        return base + timedelta(days=7)
    if "budúci mesiac" in text or "next month" in text:
        month = base.month + 1
        year = base.year
        if month > 12:
            month = 1
            year += 1
        day = min(base.day, 28)
        try:
            return date(year, month, day)
        except ValueError:
            return date(year, month, 1)
    if "tento týždeň" in text or "tento tyzden" in text or text == "this week":
        return base

    for name, weekday in {**WEEKDAYS_SK, **WEEKDAYS_EN}.items():
        if name in text:
            delta = (weekday - base.weekday()) % 7
            if delta == 0:
                delta = 7
            return base + timedelta(days=delta)
    return None
