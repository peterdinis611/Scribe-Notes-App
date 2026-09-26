"""Local agent planner + document brief (stdlib only, no cloud).

Mirrors scribe-core chat intents so the Python sidecar can plan tool loops
and optionally run a multi-tool document brief in one RPC round-trip.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

_AGENT_TOOL_LIMIT = 3

# Ordered like crates/scribe-core/src/nlp/chat_intent.rs — first matches win.
_INTENT_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("summarize", ("summarize", "summary", "tlldr", "digest", "zhrn", "zhrnutie", "strucne")),
    ("outline", ("outline", "structure", "heading", "osnova", "struktura", "nadpisy")),
    ("tasks", ("task", "todo", "to-do", "action item", "checklist", "ulohy", "otvorene ulohy")),
    (
        "dates",
        ("date", "deadline", "due date", "schedule", "datumy", "terminy", "this week", "tento tyzden"),
    ),
    (
        "meeting",
        (
            "meeting",
            "standup",
            "retro",
            "meeting notes",
            "zapis zo stretnut",
            "porada",
            "rozhodnutia zo stretnut",
        ),
    ),
    (
        "terminology",
        (
            "terminology",
            "term consistency",
            "inconsistent term",
            "terminologia",
            "konzistencia pojmov",
            "nekonzistent",
        ),
    ),
    ("wiki", ("wiki link", "wikilink", "backlink", "wiki odkazy", "prepojen")),
    (
        "organize",
        ("organize", "suggest folder", "suggest tag", "zarad", "priecinok", "tagy", "organizuj"),
    ),
    (
        "duplicates",
        ("duplicate", "redundant", "near duplicate", "duplicit", "redundantn", "podobne subory"),
    ),
    ("citations", ("citation", "cite", "source for", "citac", "zdroje", "podloz")),
    ("quiz", ("outline quiz", "quiz from outline", "kviz z osnovy", "test z osnovy")),
    (
        "revision",
        ("revision", "what changed", "diff summary", "co sa zmenilo", "revizia", "zmeny medzi"),
    ),
    ("rewrite", ("rewrite", "rephrase", "prepis", "preformuluj")),
    (
        "similar",
        (
            "related note",
            "similar note",
            "connected note",
            "how does this note connect",
            "how does this connect",
            "suvisiace",
            "podobne poznamky",
        ),
    ),
    ("flashcards", ("flashcard", "study card", "quiz me", "karticky", "kartick", "kviz")),
    (
        "takeaways",
        (
            "takeaway",
            "key point",
            "executive summary",
            "zavery",
            "hlavne body",
            "zhrnutie rozhodnut",
        ),
    ),
    (
        "style",
        (
            "writing coach",
            "style tip",
            "clarity",
            "passive voice",
            "filler word",
            "styl",
            "jasnost",
            "trpny rod",
            "vyplnove",
        ),
    ),
    ("spellcheck", ("spellcheck", "spelling", "typo", "pravopis", "preklepy")),
]

_DOCUMENT_TOOLS = {
    "summarize",
    "outline",
    "tasks",
    "dates",
    "meeting",
    "terminology",
    "wiki",
    "organize",
    "quiz",
    "revision",
    "rewrite",
    "similar",
    "flashcards",
    "takeaways",
    "style",
    "spellcheck",
    "document_answer",
}


def _fold(text: str) -> str:
    lowered = (text or "").strip().lower()
    # Strip combining marks (SK/CS diacritics) like Rust fold_intent.
    decomposed = unicodedata.normalize("NFD", lowered)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def match_agent_intents(goal: str, *, max_tools: int = _AGENT_TOOL_LIMIT) -> list[str]:
    folded = _fold(goal)
    if not folded:
        return []
    limit = max(1, min(int(max_tools or _AGENT_TOOL_LIMIT), 6))
    out: list[str] = []
    for tool, needles in _INTENT_RULES:
        if any(needle in folded for needle in needles):
            out.append(tool)
            if len(out) >= limit:
                break
    return out


def plan_agent_goal(
    goal: str,
    *,
    scope: str = "document",
    max_tools: int = _AGENT_TOOL_LIMIT,
) -> dict[str, Any]:
    """Plan Local Agent tools from a free-form goal (EN/SK heuristics)."""
    trimmed = (goal or "").strip()
    scope_norm = "library" if str(scope or "").lower().startswith("lib") else "document"
    limit = max(1, min(int(max_tools or _AGENT_TOOL_LIMIT), 6))
    tools = match_agent_intents(trimmed, max_tools=limit)

    if scope_norm == "library":
        tools = [tool for tool in tools if tool not in {"document_answer"} or True]
        # Drop pure document-only tools when no note is implied — keep dates/duplicates/citations.
        library_ok = {
            "dates",
            "duplicates",
            "citations",
            "summarize",
            "tasks",
            "takeaways",
            "similar",
            "library_answer",
        }
        filtered = [tool for tool in tools if tool in library_ok]
        tools = filtered

    needs = len(tools) == 0
    return {
        "goal": trimmed,
        "scope": scope_norm,
        "tools": tools,
        "needsClarification": needs,
        "clarifyOptions": (
            ["summarize", "takeaways", "tasks", "dates", "document_answer"]
            if scope_norm == "document"
            else ["dates", "duplicates", "citations", "library_answer", "tasks"]
        )
        if needs
        else [],
        "source": "python",
    }


def _section(title: str, body: str) -> dict[str, Any]:
    return {"tool": title, "title": title, "markdown": body.strip()}


def agent_document_brief(
    text: str,
    *,
    goal: str = "",
    tools: list[str] | None = None,
    limit: int = 8,
) -> dict[str, Any]:
    """Run several document NLP tools in one pass and return a markdown brief."""
    source = text or ""
    limit = max(1, min(int(limit or 8), 20))
    planned = [str(item) for item in (tools or []) if str(item).strip()]
    if not planned:
        planned = match_agent_intents(goal or "summarize takeaways", max_tools=_AGENT_TOOL_LIMIT)
    if not planned:
        planned = ["summarize", "takeaways"]
    planned = [tool for tool in planned if tool in _DOCUMENT_TOOLS][:_AGENT_TOOL_LIMIT]
    if not planned:
        planned = ["summarize"]

    sections: list[dict[str, Any]] = []

    for tool in planned:
        try:
            if tool == "summarize":
                from .summarize import summarize_text

                result = summarize_text(source, max_sentences=min(4, limit))
                summary = str(result.get("summary") or "").strip()
                if summary:
                    sections.append(_section("summarize", summary))
            elif tool == "outline":
                from .outline import extract_outline

                result = extract_outline(source, limit=limit)
                items = result.get("items") or []
                lines = []
                for item in items[:limit]:
                    if isinstance(item, dict):
                        title = item.get("title") or item.get("text") or ""
                        level = int(item.get("level") or 1)
                        lines.append(f"{'  ' * max(0, level - 1)}- {title}")
                    else:
                        lines.append(f"- {item}")
                if lines:
                    sections.append(_section("outline", "\n".join(lines)))
            elif tool == "tasks":
                from .tasks import extract_tasks

                result = extract_tasks(source)
                open_tasks = [
                    item
                    for item in (result.get("tasks") or [])
                    if not item.get("checked")
                ][:limit]
                if open_tasks:
                    lines = [
                        f"- {item.get('text')}"
                        + (f" _(due {item.get('dueHint')})_" if item.get("dueHint") else "")
                        for item in open_tasks
                        if item.get("text")
                    ]
                    sections.append(_section("tasks", "\n".join(lines)))
            elif tool == "dates":
                from .dates import extract_dates

                result = extract_dates(source)
                dates = (result.get("events") or result.get("dates") or [])[:limit]
                if dates:
                    lines = [
                        f"- {item.get('text')}"
                        + (f" ({item.get('kind')})" if item.get("kind") else "")
                        for item in dates
                        if item.get("text")
                    ]
                    sections.append(_section("dates", "\n".join(lines)))
            elif tool == "takeaways":
                from .takeaways import extract_takeaways

                result = extract_takeaways(source, limit=limit)
                items = result.get("takeaways") or []
                if items:
                    lines = [f"- {item.get('text')}" for item in items if item.get("text")]
                    header = result.get("summary") or ""
                    body = (f"{header}\n\n" if header else "") + "\n".join(lines)
                    sections.append(_section("takeaways", body))
            elif tool == "meeting":
                from .meeting_notes import meeting_notes_pack

                result = meeting_notes_pack(source, limit=limit)
                chunks: list[str] = []
                if result.get("attendees"):
                    chunks.append(
                        "**Attendees**\n"
                        + "\n".join(f"- {name}" for name in result["attendees"][:12])
                    )
                if result.get("decisions"):
                    chunks.append(
                        "**Decisions**\n"
                        + "\n".join(
                            f"- {item.get('text')}"
                            for item in result["decisions"][:limit]
                            if item.get("text")
                        )
                    )
                if result.get("actionItems"):
                    chunks.append(
                        "**Action items**\n"
                        + "\n".join(
                            f"- {item.get('text')}"
                            for item in result["actionItems"][:limit]
                            if item.get("text")
                        )
                    )
                if chunks:
                    sections.append(_section("meeting", "\n\n".join(chunks)))
            elif tool == "terminology":
                from .terminology import check_terminology

                result = check_terminology(source, limit=limit)
                issues = result.get("issues") or []
                if issues:
                    lines = []
                    for item in issues[:limit]:
                        canonical = item.get("canonical") or ""
                        variants = ", ".join(
                            v.get("term") or ""
                            for v in (item.get("variants") or [])[:4]
                            if v.get("term")
                        )
                        lines.append(f"- **{canonical}** ↔ {variants}".strip(" ↔"))
                    sections.append(_section("terminology", "\n".join(lines)))
            elif tool == "flashcards":
                from .flashcards import extract_flashcards

                result = extract_flashcards(source, limit=min(limit, 8))
                cards = result.get("cards") or []
                if cards:
                    lines = []
                    for index, card in enumerate(cards[:limit], start=1):
                        q = card.get("question") or card.get("front") or ""
                        a = card.get("answer") or ""
                        lines.append(f"**Q{index}.** {q}" + (f"\n  → {a}" if a else ""))
                    sections.append(_section("flashcards", "\n\n".join(lines)))
            elif tool == "quiz":
                from .outline_quiz import outline_quiz

                result = outline_quiz(source, limit=min(limit, 8))
                questions = result.get("questions") or []
                if questions:
                    lines = []
                    for index, item in enumerate(questions[:limit], start=1):
                        q = item.get("question") or ""
                        a = item.get("answer") or ""
                        lines.append(f"**Q{index}.** {q}" + (f"\n  → {a}" if a else ""))
                    sections.append(_section("quiz", "\n\n".join(lines)))
            elif tool == "style":
                from .writing_coach import writing_coach

                result = writing_coach(source, limit=limit)
                hints = result.get("hints") or []
                if hints:
                    lines = [
                        f"- {item.get('message') or item.get('code')}"
                        for item in hints[:limit]
                        if item.get("message") or item.get("code")
                    ]
                    sections.append(_section("style", "\n".join(lines)))
            elif tool == "spellcheck":
                from .spellcheck import spellcheck_text

                result = spellcheck_text(source, max_issues=limit)
                issues = result.get("issues") or []
                if issues:
                    lines = []
                    for item in issues[:limit]:
                        word = item.get("word") or ""
                        suggestions = ", ".join((item.get("suggestions") or [])[:3])
                        lines.append(f"- {word}" + (f" → {suggestions}" if suggestions else ""))
                    sections.append(_section("spellcheck", "\n".join(lines)))
            elif tool == "similar":
                # Similar needs a corpus — skip in single-doc brief.
                continue
            elif tool in {"wiki", "organize", "revision", "rewrite", "document_answer"}:
                # Need library context or editor selection — skip in pure-text brief.
                continue
        except Exception:  # noqa: BLE001 — soft-fail per tool like the FE agent loop
            continue

    answer_parts = [f"### {item['tool']}\n\n{item['markdown']}" for item in sections]
    return {
        "goal": (goal or "").strip(),
        "tools": planned,
        "sections": sections,
        "answer": "\n\n".join(answer_parts),
        "count": len(sections),
        "source": "python",
    }


# Keep re export for tests / debug.
_DIACRITIC_STRIP_RE = re.compile(r"[\u0300-\u036f]")
