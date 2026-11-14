"""Pure tool planner from intents (parity with Rust ``scribe-ai::tool_plan``)."""

from __future__ import annotations

# Lightweight EN/SK keyword → intent map (subset of Rust chat_intent).
_INTENT_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("tasks", ("task", "todo", "úloha", "uloha", "checklist", "action item")),
    ("summarize", ("summar", "tl;dr", "zhrn", "súhrn", "suhrn", "overview")),
    ("search", ("search", "find", "nájd", "najd", "hľad", "hlad", "where is")),
    ("timeline", ("timeline", "when", "deadline", "termín", "termin", "date")),
    ("roadmap", ("roadmap", "milestones", "roadmapa", "míľniky", "milniky", "fázy", "fazy")),
    ("rewrite", ("rewrite", "polish", "prepíš", "prepis", "improve writing")),
    ("research", ("research", "citation", "source", "zdroj", "evidence")),
    ("meeting", ("meeting", "porada", "schôdz", "schodz", "standup", "notes from call")),
]


def match_agent_intents(question: str) -> list[str]:
    hay = (question or "").casefold()
    out: list[str] = []
    for intent, needles in _INTENT_RULES:
        if any(n in hay for n in needles) and intent not in out:
            out.append(intent)
    return out


def _tools_for_intent(intent: str) -> tuple[str, ...]:
    return {
        "summarize": ("summarize", "section_summaries", "document_answer"),
        "summary": ("summarize", "section_summaries", "document_answer"),
        "tasks": ("tasks", "task_rank", "open_loops"),
        "todo": ("tasks", "task_rank", "open_loops"),
        "search": ("library_search", "document_answer", "citation_pack"),
        "find": ("library_search", "document_answer", "citation_pack"),
        "timeline": ("timeline", "dates", "forward_plan", "roadmap"),
        "dates": ("timeline", "dates", "forward_plan", "roadmap"),
        "roadmap": ("roadmap", "forward_plan", "outline"),
        "milestones": ("roadmap", "forward_plan", "outline"),
        "rewrite": ("rewrite", "tone"),
        "polish": ("rewrite", "tone"),
        "research": ("research_pack", "library_search", "citation_pack"),
        "meeting": ("meeting_notes", "commitments", "tasks"),
    }.get(intent, ("library_search", "document_answer"))


def plan_tools_from_question(
    question: str,
    allowed_tools: list[str] | None = None,
    limit: int = 4,
) -> list[str]:
    allowed = list(allowed_tools or [])
    cap = max(1, min(int(limit or 4), 8))
    out: list[str] = []
    for intent in match_agent_intents(question):
        for tool in _tools_for_intent(intent):
            if tool in allowed and tool not in out:
                out.append(tool)
            if len(out) >= cap:
                return out
    if not out:
        for tool in ("library_search", "document_answer", "timeline", "tasks"):
            if tool in allowed:
                out.append(tool)
            if len(out) >= cap:
                break
    return out
