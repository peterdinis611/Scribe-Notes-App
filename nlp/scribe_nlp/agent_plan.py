"""Local agent planner + document brief (stdlib only, no cloud).

Mirrors scribe-core chat intents so the Python sidecar can plan tool loops
and optionally run a multi-tool document brief in one RPC round-trip.
"""

from __future__ import annotations

import json
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
    (
        "explain",
        ("explain", "what does this mean", "vysvetli", "vysvetlenie", "co to znamena"),
    ),
    (
        "simplify",
        ("simplify", "simpler", "plain language", "zjednodus", "jednoduchsie"),
    ),
    (
        "action_items",
        ("action items", "extract actions", "akcne body", "ulohy z textu"),
    ),
    (
        "glossary",
        ("glossary", "define terms", "key terms", "slovnik", "pojmy", "definicie"),
    ),
    (
        "compare_notes",
        ("compare notes", "diff notes", "porovnaj poznamky", "porovnanie poznamok"),
    ),
    (
        "spellcheck",
        (
            "spellcheck",
            "spell check",
            "spelling",
            "typo",
            "typos",
            "pravopis",
            "preklepy",
            "preklep",
            "skontroluj pravopis",
            "skontroluj preklepy",
            "oprav preklepy",
            "oprav pravopis",
            "check spelling",
            "fix spelling",
            "fix typos",
        ),
    ),
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
    "explain",
    "simplify",
    "action_items",
    "glossary",
    "compare_notes",
    "spellcheck",
    "document_answer",
}


def _fold(text: str) -> str:
    lowered = (text or "").strip().lower()
    # Strip combining marks (SK/CS diacritics) like Rust fold_intent.
    decomposed = unicodedata.normalize("NFD", lowered)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def match_agent_intents_scored(
    goal: str, *, max_tools: int = _AGENT_TOOL_LIMIT
) -> list[tuple[str, float]]:
    folded = _fold(goal)
    if not folded:
        return []
    limit = max(1, min(int(max_tools or _AGENT_TOOL_LIMIT), 6))
    scored: list[tuple[str, float]] = []
    for tool, needles in _INTENT_RULES:
        hits = [needle for needle in needles if needle in folded]
        if not hits:
            continue
        # Longer / more specific needle ⇒ higher confidence.
        best = max(len(needle) for needle in hits)
        score = min(0.98, 0.42 + best / 28.0 + 0.08 * (len(hits) - 1))
        scored.append((tool, round(score, 3)))
        if len(scored) >= limit:
            break
    return scored


def match_agent_intents(goal: str, *, max_tools: int = _AGENT_TOOL_LIMIT) -> list[str]:
    return [tool for tool, _score in match_agent_intents_scored(goal, max_tools=max_tools)]


def plan_agent_goal(
    goal: str,
    *,
    scope: str = "document",
    max_tools: int = _AGENT_TOOL_LIMIT,
    llm: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Plan Local Agent tools from a free-form goal (EN/SK heuristics + optional LLM)."""
    trimmed = (goal or "").strip()
    scope_norm = "library" if str(scope or "").lower().startswith("lib") else "document"
    limit = max(1, min(int(max_tools or _AGENT_TOOL_LIMIT), 6))
    scored = match_agent_intents_scored(trimmed, max_tools=limit)

    if scope_norm == "library":
        library_ok = {
            "dates",
            "duplicates",
            "citations",
            "summarize",
            "tasks",
            "takeaways",
            "similar",
            "library_answer",
            "brief",
        }
        scored = [(tool, score) for tool, score in scored if tool in library_ok]

    tools = [tool for tool, _score in scored]
    tool_scores = [{"tool": tool, "score": score} for tool, score in scored]
    confidence = max((score for _tool, score in scored), default=0.0)
    source = "python"
    needs = len(tools) == 0 or confidence < 0.48

    if llm and (needs or confidence < 0.62):
        llm_plan = _try_llm_plan(trimmed, scope=scope_norm, limit=limit, llm=llm)
        if llm_plan:
            tools = llm_plan["tools"]
            tool_scores = [{"tool": tool, "score": 0.8} for tool in tools]
            confidence = float(llm_plan.get("confidence") or 0.8)
            needs = len(tools) == 0
            source = "llm"

    return {
        "goal": trimmed,
        "scope": scope_norm,
        "tools": [] if needs and len(tools) == 0 else tools,
        "toolScores": tool_scores,
        "confidence": confidence,
        "needsClarification": needs and len(tools) == 0,
        "clarifyOptions": (
            ["summarize", "takeaways", "tasks", "dates", "document_answer"]
            if scope_norm == "document"
            else ["dates", "duplicates", "citations", "library_answer", "brief"]
        )
        if needs and len(tools) == 0
        else [],
        "source": source,
    }


_ALLOWED_PLAN_TOOLS = {
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
    "explain",
    "simplify",
    "action_items",
    "glossary",
    "compare_notes",
    "spellcheck",
    "document_answer",
    "library_answer",
    "duplicates",
    "citations",
    "brief",
}


def _try_llm_plan(
    goal: str,
    *,
    scope: str,
    limit: int,
    llm: dict[str, Any],
) -> dict[str, Any] | None:
    from .llm import try_complete_from_options

    allowed = sorted(
        tool
        for tool in _ALLOWED_PLAN_TOOLS
        if scope != "library"
        or tool
        in {
            "dates",
            "duplicates",
            "citations",
            "summarize",
            "tasks",
            "takeaways",
            "similar",
            "library_answer",
            "brief",
        }
    )
    system = (
        "You are Scribe's local agent planner. Pick tools for the user's goal. "
        "Reply with ONLY a JSON object: {\"tools\":[\"tool_id\",...],\"confidence\":0.0-1.0}. "
        f"Allowed tools: {', '.join(allowed)}. Max {limit} tools. Prefer fewer tools."
    )
    prompt = f"Scope: {scope}\nGoal: {goal.strip()}"
    raw = try_complete_from_options(
        llm,
        prompt=prompt,
        system=system,
        temperature=0.1,
        max_tokens=200,
    )
    if not raw:
        return None
    try:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            return None
        parsed = json.loads(raw[start : end + 1])
    except Exception:
        return None
    if not isinstance(parsed, dict):
        return None
    tools_raw = parsed.get("tools")
    if not isinstance(tools_raw, list):
        return None
    tools: list[str] = []
    for item in tools_raw:
        name = str(item).strip()
        if name in allowed and name not in tools:
            tools.append(name)
        if len(tools) >= limit:
            break
    if not tools:
        return None
    confidence = parsed.get("confidence")
    try:
        conf = float(confidence)
    except (TypeError, ValueError):
        conf = 0.75
    return {"tools": tools, "confidence": max(0.0, min(conf, 1.0))}


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
            elif tool == "explain":
                from .note_skills import explain_selection

                result = explain_selection(source)
                text_out = (result.get("explanation") or "").strip()
                if text_out:
                    sections.append(_section("explain", text_out))
            elif tool == "simplify":
                from .note_skills import simplify_text

                result = simplify_text(source)
                text_out = (result.get("simplified") or result.get("text") or "").strip()
                if text_out:
                    sections.append(_section("simplify", text_out))
            elif tool == "action_items":
                from .note_skills import action_items_from_text

                result = action_items_from_text(source, limit=limit)
                items = result.get("items") or result.get("actionItems") or []
                if items:
                    lines = [
                        f"- {item.get('text') or item}" if isinstance(item, dict) else f"- {item}"
                        for item in items[:limit]
                    ]
                    sections.append(_section("action_items", "\n".join(lines)))
            elif tool == "glossary":
                from .note_skills import glossary_from_text

                result = glossary_from_text(source, limit=limit)
                entries = result.get("entries") or result.get("terms") or []
                if entries:
                    lines = []
                    for entry in entries[:limit]:
                        if isinstance(entry, dict):
                            term = entry.get("term") or ""
                            definition = entry.get("definition") or ""
                            lines.append(f"- **{term}** — {definition}".strip(" —"))
                        else:
                            lines.append(f"- {entry}")
                    sections.append(_section("glossary", "\n".join(lines)))
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
            elif tool in {
                "wiki",
                "organize",
                "revision",
                "rewrite",
                "document_answer",
                "compare_notes",
            }:
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
