"""Build a phased roadmap from note headings / outline / forward-looking cues."""

from __future__ import annotations

import re
from typing import Any

from .forward_plan import forward_plan
from .section_summaries import section_summaries
from .text_utils import normalize_text

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$")
_BULLET_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)]|\[(?: |x|X)\])\s+(.+)$")
_PHASE_TITLE_RE = re.compile(
    r"^(roadmap|road\s*map|cesta|mapa|phases?|fázy|fazy|milestones?|míľniky|milniky|"
    r"now|next|later|teraz|ďalej|dalej|neskôr|neskor|q[1-4]|h[12]|"
    r"phase\s*\d+|fáza\s*\d+|faza\s*\d+|sprint\s*\d+|epics?)\b",
    re.IGNORECASE,
)


def _horizon_for_title(title: str) -> str:
    t = (title or "").strip().lower()
    if t in {"now", "teraz", "today", "dnes"}:
        return "now"
    if t in {"next", "ďalej", "dalej", "soon", "čoskoro", "coskoro"} or t.startswith(
        ("next ", "ďal", "dal")
    ):
        return "next"
    if t in {"later", "neskôr", "neskor", "someday", "budúcnosť", "buducnost"} or t.startswith(
        ("later", "nesk")
    ):
        return "later"
    if "milestone" in t or "míľnik" in t or "milnik" in t:
        return "milestone"
    return "phase"


def _push(items: list[dict[str, Any]], raw: str, *, kind: str, limit: int) -> None:
    if len(items) >= limit:
        return
    cleaned = normalize_text(raw)
    if len(cleaned) < 3:
        return
    key = cleaned.lower()
    if any(str(item.get("text", "")).lower() == key for item in items):
        return
    items.append({"text": cleaned, "kind": kind})


def _collect_bullets(body: str, *, limit: int = 12) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for line in (body or "").splitlines():
        match = _BULLET_RE.match(line)
        if match:
            _push(items, match.group(1), kind="bullet", limit=limit)
            continue
        trimmed = line.strip()
        if len(trimmed) >= 12 and not trimmed.startswith("#") and len(items) < 2:
            _push(items, trimmed, kind="note", limit=limit)
    return items


def _phases_from_headings(text: str, limit: int) -> list[dict[str, Any]]:
    phases: list[dict[str, Any]] = []
    title = ""
    body_lines: list[str] = []
    order = 0

    def flush() -> None:
        nonlocal order, title, body_lines
        if not title:
            body_lines = []
            return
        if not _PHASE_TITLE_RE.match(title) and order == 0 and not phases:
            body_lines = []
            return
        items = _collect_bullets("\n".join(body_lines), limit=12)
        if not items and not _PHASE_TITLE_RE.match(title):
            body_lines = []
            return
        order += 1
        phases.append(
            {
                "id": f"phase-{order}",
                "title": normalize_text(title),
                "horizon": _horizon_for_title(title),
                "order": order,
                "items": items,
            }
        )
        body_lines = []

    for line in (text or "").splitlines():
        if len(phases) >= limit:
            break
        match = _HEADING_RE.match(line)
        if match:
            flush()
            title = (match.group(2) or "").strip()
            continue
        body_lines.append(line)
    flush()
    return phases[:limit]


def _phases_from_outline(text: str, limit: int) -> list[dict[str, Any]]:
    sections = section_summaries(text, limit=limit, max_sentences=2)
    phases: list[dict[str, Any]] = []
    for index, section in enumerate(sections.get("sections") or []):
        title = str(section.get("title") or "").strip() or "Section"
        if title.lower() == "introduction" and int(section.get("charCount") or 0) < 40:
            continue
        items: list[dict[str, Any]] = []
        for bullet in (section.get("bullets") or [])[:8]:
            _push(items, str(bullet), kind="summary", limit=8)
        if not items and section.get("summary"):
            _push(items, str(section["summary"]), kind="summary", limit=8)
        if not items:
            continue
        order = index + 1
        phases.append(
            {
                "id": f"outline-{order}",
                "title": title,
                "horizon": "phase",
                "order": order,
                "items": items,
            }
        )
        if len(phases) >= limit:
            break
    return phases


def _phases_from_forward_plan(text: str, limit: int) -> list[dict[str, Any]]:
    plan = forward_plan(text, limit=16)
    phases: list[dict[str, Any]] = []
    if plan.get("nextSteps"):
        phases.append(
            {
                "id": "now",
                "title": "Now",
                "horizon": "now",
                "order": 1,
                "items": [
                    {"text": item["text"], "kind": item.get("kind") or "next_step"}
                    for item in plan["nextSteps"][:8]
                ],
            }
        )
    if plan.get("agenda"):
        phases.append(
            {
                "id": "next",
                "title": "Next",
                "horizon": "next",
                "order": 2,
                "items": [
                    {"text": item["text"], "kind": item.get("kind") or "agenda"}
                    for item in plan["agenda"][:8]
                ],
            }
        )
    if plan.get("upcoming"):
        phases.append(
            {
                "id": "later",
                "title": "Later",
                "horizon": "later",
                "order": 3,
                "items": [
                    {"text": item["text"], "kind": item.get("kind") or "upcoming"}
                    for item in plan["upcoming"][:8]
                ],
            }
        )
    return phases[:limit]


def roadmap(text: str, *, limit: int = 8) -> dict[str, Any]:
    limit = max(1, min(int(limit or 8), 16))
    source = text or ""
    strategy = "empty"
    phases = _phases_from_headings(source, limit)
    if phases:
        strategy = "headings"
    else:
        phases = _phases_from_outline(source, limit)
        if phases:
            strategy = "outline"
        else:
            phases = _phases_from_forward_plan(source, limit)
            if phases:
                strategy = "forward_plan"
    item_count = sum(len(phase.get("items") or []) for phase in phases)
    return {
        "phases": phases,
        "count": len(phases),
        "itemCount": item_count,
        "source": "python",
        "strategy": strategy,
    }


def roadmap_to_markdown(plan: dict[str, Any]) -> str:
    phases = plan.get("phases") or []
    if not phases:
        return ""
    lines = ["## Roadmap", ""]
    for phase in phases:
        lines.append(f"### {phase.get('title') or 'Phase'}")
        items = phase.get("items") or []
        if not items:
            lines.append(f"- _{phase.get('horizon') or 'phase'}_")
        else:
            for item in items:
                lines.append(f"- [ ] {item.get('text')}")
        lines.append("")
    return "\n".join(lines).strip()
