"""Summarize each markdown / numbered section of a long note."""

from __future__ import annotations

import re
from typing import Any

from .summarize import summarize_text
from .text_utils import normalize_text, split_sentences

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$")
_NUMBERED_RE = re.compile(r"^(\d{1,2}|[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ])[.)]\s+(.+)$")


def _split_sections(text: str) -> list[tuple[str, int, str]]:
    """Return (title, level, body) sections. Untitled lead content is included."""
    lines = (text or "").splitlines()
    sections: list[tuple[str, int, list[str]]] = []
    current_title = "Introduction"
    current_level = 1
    current_body: list[str] = []

    def flush() -> None:
        nonlocal current_body
        body = "\n".join(current_body).strip()
        if body or current_title != "Introduction":
            sections.append((current_title, current_level, current_body[:]))
        current_body = []

    for line in lines:
        heading = _HEADING_RE.match(line)
        numbered = _NUMBERED_RE.match(line) if not heading else None
        if heading:
            flush()
            current_level = len(heading.group(1))
            current_title = normalize_text(heading.group(2)) or "Section"
            continue
        if numbered and len(normalize_text(numbered.group(2))) >= 3:
            flush()
            current_level = 2
            current_title = normalize_text(numbered.group(2)) or "Section"
            continue
        current_body.append(line)

    flush()

    result: list[tuple[str, int, str]] = []
    for title, level, body_lines in sections:
        body = "\n".join(body_lines).strip()
        if not body and title == "Introduction":
            continue
        result.append((title, level, body))
    return result


def section_summaries(
    text: str,
    *,
    limit: int = 12,
    max_sentences: int = 2,
) -> dict[str, Any]:
    source = text or ""
    limit = max(1, min(int(limit or 12), 40))
    max_sentences = max(1, min(int(max_sentences or 2), 4))

    sections = _split_sections(source)
    items: list[dict[str, Any]] = []

    for title, level, body in sections[:limit]:
        sentences = [s for s in split_sentences(body) if len(s.strip()) >= 20]
        if len(body.strip()) < 40 or not sentences:
            summary = normalize_text(body)[:220] if body.strip() else ""
            bullets: list[str] = []
        else:
            summarized = summarize_text(body, max_sentences=max_sentences)
            summary = str(summarized.get("summary") or "")
            bullets = [str(b) for b in (summarized.get("bullets") or []) if b][:4]
        items.append(
            {
                "title": title,
                "level": level,
                "summary": summary,
                "bullets": bullets,
                "charCount": len(body),
                "sentenceCount": len(sentences),
            }
        )

    return {
        "sections": items,
        "count": len(items),
        "source": "python",
    }
