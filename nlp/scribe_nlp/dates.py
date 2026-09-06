from __future__ import annotations

import re
from datetime import date, timedelta
from functools import lru_cache

from .normalize import fold_diacritics
from .text_utils import normalize_text

# Absolute: ISO or D.M[.YYYY] / D/M[/YYYY]
ABSOLUTE_DATE = re.compile(
    r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)\b"
)
DEADLINE = re.compile(
    r"(?i)\b(?:do|until|by|deadline|termin|due)\s+"
    r"(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|"
    r"dnes|today|zajtra|tomorrow|pozajtra|vcera|yesterday|"
    r"buduci\s+(?:tyzden|mesiac)|next\s+(?:week|month)|"
    r"(?:o|za|in)\s+\d{1,3}\s+(?:dni|days?|tyzdne?|weeks?|mesiace?|months?)|"
    r"buduci\s+(?:pondelok|utorok|streda|stvrtok|piatok|sobota|nedela)|"
    r"next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
    r")\b"
)
RELATIVE = re.compile(
    r"(?i)\b("
    r"dnes|today|"
    r"zajtra|tomorrow|"
    r"pozajtra|"
    r"vcera|yesterday|"
    r"buduci\s+(?:tyzden|mesiac)|next\s+(?:week|month)|"
    r"tento\s+tyzden|this\s+week|"
    r"(?:o|za|in)\s+\d{1,3}\s+(?:dni|days?|tyzdne?|weeks?|mesiace?|months?)|"
    r"buduci\s+(?:pondelok|utorok|streda|stvrtok|piatok|sobota|nedela)|"
    r"next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
    r")\b"
)

WEEKDAYS: dict[str, int] = {
    "pondelok": 0,
    "utorok": 1,
    "streda": 2,
    "stvrtok": 3,
    "piatok": 4,
    "sobota": 5,
    "nedela": 6,
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}

_OFFSET_RE = re.compile(
    r"(?i)^(?:o|za|in)\s+(\d{1,3})\s+(dni|days?|tyzdne?|weeks?|mesiace?|months?)$"
)
_WS = re.compile(r"\s+")


def extract_dates(
    text: str,
    *,
    today: date | None = None,
) -> dict[str, object]:
    """Absolute + relative date/event cues for tasks and journal timeline."""
    source = text or ""
    folded = fold_diacritics(source)
    base = today or date.today()
    events: list[dict[str, object]] = []
    seen: set[str] = set()
    # Character spans in folded text claimed by deadline/relative (skip nested absolute).
    claimed: list[tuple[int, int]] = []

    def _add(raw: str, kind: str, resolved: date | None = None) -> None:
        key = f"{kind}:{raw.lower()}:{resolved.isoformat() if resolved else ''}"
        if key in seen:
            return
        # Collapse absolute duplicate of the same resolved day already covered by deadline.
        if kind == "absolute" and resolved is not None:
            iso = resolved.isoformat()
            for existing in events:
                if existing.get("resolvedDate") == iso and existing.get("kind") == "deadline":
                    return
        seen.add(key)
        events.append(
            {
                "text": normalize_text(raw),
                "kind": kind,
                "resolvedDate": resolved.isoformat() if resolved else None,
            }
        )

    for match in DEADLINE.finditer(folded):
        raw = match.group(1)
        claimed.append((match.start(1), match.end(1)))
        original = source[match.start(1) : match.end(1)] if match.end(1) <= len(source) else raw
        display = normalize_text(source[match.start() : match.end()] if match.end() <= len(source) else match.group(0))
        resolved = _parse_absolute(raw, base.year) or _resolve_relative(raw, base)
        _add(display or f"do {original}", "deadline", resolved)

    for match in RELATIVE.finditer(folded):
        start, end = match.start(1), match.end(1)
        if _overlaps(claimed, start, end):
            continue
        raw = match.group(1)
        claimed.append((start, end))
        original = source[start:end] if end <= len(source) else raw
        _add(original, "relative", _resolve_relative(raw, base))

    for match in ABSOLUTE_DATE.finditer(folded):
        start, end = match.start(1), match.end(1)
        if _overlaps(claimed, start, end):
            continue
        raw = match.group(1)
        original = source[start:end] if end <= len(source) else raw
        _add(original, "absolute", _parse_absolute(raw, base.year))

    events.sort(
        key=lambda item: (
            item.get("resolvedDate") is None,
            str(item.get("resolvedDate") or "9999"),
            str(item.get("text") or ""),
        )
    )
    return {"events": events, "count": len(events)}


def resolve_due_hint(
    text: str,
    *,
    today: date | None = None,
) -> str | None:
    """Best single due date (ISO) for a task line — prefers deadline, then soonest resolved."""
    result = extract_dates(text, today=today)
    events = result.get("events") or []
    if not events:
        return None

    def _rank(item: dict[str, object]) -> tuple[int, str]:
        kind = str(item.get("kind") or "")
        kind_rank = 0 if kind == "deadline" else 1 if kind == "relative" else 2
        resolved = str(item.get("resolvedDate") or "9999-12-31")
        return (kind_rank, resolved)

    ranked = sorted(events, key=_rank)
    for item in ranked:
        resolved = item.get("resolvedDate")
        if isinstance(resolved, str) and resolved:
            return resolved
    # Fallback: raw absolute token when unparseable.
    text_value = ranked[0].get("text")
    return str(text_value) if text_value else None


def _overlaps(ranges: list[tuple[int, int]], start: int, end: int) -> bool:
    for left, right in ranges:
        if start < right and end > left:
            return True
    return False


def _parse_absolute(raw: str, default_year: int) -> date | None:
    value = raw.strip()
    try:
        if "-" in value and len(value) >= 8 and value[4] == "-":
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
    text = _WS.sub(" ", fold_diacritics(raw).strip().lower())
    if text in {"dnes", "today"}:
        return base
    if text in {"zajtra", "tomorrow"}:
        return base + timedelta(days=1)
    if text == "pozajtra":
        return base + timedelta(days=2)
    if text in {"vcera", "yesterday"}:
        return base - timedelta(days=1)
    if text in {"buduci tyzden", "next week"}:
        return base + timedelta(days=7)
    if text in {"buduci mesiac", "next month"}:
        return _add_months(base, 1)
    if text in {"tento tyzden", "this week"}:
        return base - timedelta(days=base.weekday())

    offset = _OFFSET_RE.match(text)
    if offset:
        amount = int(offset.group(1))
        unit = offset.group(2).lower()
        if unit.startswith("d"):
            return base + timedelta(days=amount)
        if unit.startswith("t") or unit.startswith("w"):
            return base + timedelta(weeks=amount)
        if unit.startswith("m"):
            return _add_months(base, amount)

    for name, weekday in WEEKDAYS.items():
        if name in text:
            delta = (weekday - base.weekday()) % 7
            if delta == 0:
                delta = 7
            return base + timedelta(days=delta)
    return None


def _add_months(base: date, months: int) -> date:
    month_index = base.month - 1 + months
    year = base.year + month_index // 12
    month = month_index % 12 + 1
    day = min(base.day, _month_days(year, month))
    return date(year, month, day)


@lru_cache(maxsize=48)
def _month_days(year: int, month: int) -> int:
    if month == 2:
        leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
        return 29 if leap else 28
    if month in {4, 6, 9, 11}:
        return 30
    return 31
