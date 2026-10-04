"""Build a short study / reading plan from note sections."""

from __future__ import annotations

from typing import Any

from .section_summaries import section_summaries
from .text_utils import normalize_text


def reading_plan(text: str, *, limit: int = 8) -> dict[str, Any]:
    source = text or ""
    limit = max(1, min(int(limit or 8), 20))
    sections = section_summaries(source, limit=limit, max_sentences=2)
    steps: list[dict[str, Any]] = []

    for index, section in enumerate(sections.get("sections") or [], start=1):
        if not isinstance(section, dict):
            continue
        title = normalize_text(str(section.get("title") or f"Step {index}"))
        summary = normalize_text(str(section.get("summary") or ""))
        bullets = [normalize_text(str(b)) for b in (section.get("bullets") or []) if b][:3]
        focus = summary or (bullets[0] if bullets else title)
        minutes = 3
        char_count = int(section.get("charCount") or 0)
        if char_count > 1200:
            minutes = 10
        elif char_count > 500:
            minutes = 6
        steps.append(
            {
                "order": index,
                "title": title,
                "focus": focus[:280],
                "bullets": bullets,
                "estimatedMinutes": minutes,
                "charCount": char_count,
            }
        )
        if len(steps) >= limit:
            break

    total = sum(int(step["estimatedMinutes"]) for step in steps)
    return {
        "steps": steps,
        "count": len(steps),
        "estimatedMinutes": total,
        "source": "python",
    }
