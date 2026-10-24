"""Local agent planner + document brief (stdlib only, no cloud).

Mirrors scribe-core chat intents so the Python sidecar can plan tool loops
and optionally run a multi-tool document brief in one RPC round-trip.
"""

from __future__ import annotations

import json
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

_AGENT_TOOL_LIMIT = 3

# Library-scoped tools (MCP / FE agent). Keep LLM + keyword filters aligned.
_LIBRARY_TOOLS: frozenset[str] = frozenset(
    {
        "dates",
        "duplicates",
        "citations",
        "summarize",
        "tasks",
        "takeaways",
        "similar",
        "library_answer",
        "brief",
        "library_report",
        "terminology_library",
        "open_loops",
        "files_answer",
        "files_ingest",
        "handoff",
        "keywords",
        "wiki_health",
    }
)

# Soft boosts when plan_agent_goal(role=…) is set (mirrors JEPA role bias).
_ROLE_TOOL_BOOSTS: dict[str, tuple[str, ...]] = {
    "proofreader": ("spellcheck", "grammar", "style", "simplify"),
    "meeting": ("meeting", "action_items", "decisions", "commitments", "mentions"),
    "librarian": ("wiki_health", "wiki", "organize", "similar", "duplicates", "citations"),
    "study": ("flashcards", "quiz", "reading_plan", "takeaways", "section_summaries"),
    "organizer": (
        "tasks",
        "rank_tasks",
        "dates",
        "open_loops",
        "organize",
        "canvas_summarize",
        "wiki_health",
    ),
    "developer": (
        "code_brief",
        "explain",
        "files_answer",
        "files_ingest",
        "outline",
        "keywords",
    ),
    "general": (),
}

# Ordered like crates/scribe-core/src/nlp/chat_intent.rs — priority breaks score ties.
_INTENT_RULES: list[tuple[str, tuple[str, ...]]] = [
    (
        "handoff",
        (
            "handoff",
            "delegate",
            "pass to",
            "send to",
            "forward to",
            "posli",
            "odovzdaj",
            "predaj",
            "@organizer",
            "@meeting",
            "@librarian",
            "@proofreader",
            "@study",
            "@developer",
            "@general",
        ),
    ),
    (
        "files_ingest",
        (
            "import files",
            "ingest files",
            "files to notes",
            "sandbox to library",
            "importuj subory",
            "subory do kniznice",
            "import source",
            "import code",
            "import rust",
            "import python",
            "importuj kod",
            "importuj rust",
            "importuj python",
        ),
    ),
    (
        "files_answer",
        (
            "files answer",
            "ask files",
            "sandboxed files",
            "subory sandbox",
            "files/",
            "otazka na subory",
            "otázka na súbory",
            "ask codebase",
            "search code",
            "search rust",
            "search python",
            "najdi v kode",
            "hladaj v kode",
        ),
    ),
    (
        "code_brief",
        (
            "code brief",
            "review code",
            "review rust",
            "review python",
            "explain rust",
            "explain python",
            "explain this code",
            "code review",
            "rust code",
            "python code",
            "source code",
            "this code",
            "prezri kod",
            "analyzuj kod",
            "vysvetli rust",
            "vysvetli python",
            "vysvetli kod",
            "code overview",
        ),
    ),
    ("summarize", ("summarize", "summary", "tlldr", "digest", "zhrn", "zhrnutie", "strucne")),
    ("keywords", ("keyword", "key word", "klucove slova", "kľúčové slová")),
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
    (
        "wiki_health",
        (
            "wiki health",
            "broken links",
            "unresolved wiki",
            "graph hubs",
            "zdravie wiki",
            "rozbite odkazy",
            "nevyriesene odkazy",
            "orphan notes",
            "sirotky",
        ),
    ),
    ("wiki", ("wiki link", "wikilink", "backlink", "wiki odkazy", "prepojen")),
    (
        "canvas_summarize",
        (
            "summarize canvas",
            "canvas summary",
            "board summary",
            "zhrn canvas",
            "zhrnutie canvas",
            "zhrn board",
        ),
    ),
    (
        "canvas_to_note",
        (
            "canvas to note",
            "board to note",
            "export canvas",
            "canvas do poznamky",
            "board do poznamky",
        ),
    ),
    (
        "canvas_template",
        (
            "canvas template",
            "board template",
            "brainstorm template",
            "roadmap template",
            "sablona canvas",
            "canvas sablona",
        ),
    ),
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
    (
        "section_summaries",
        (
            "section summary",
            "section summaries",
            "summarize sections",
            "zhrnutie sekcii",
            "zhrn sekcie",
            "po kapitolach",
        ),
    ),
    (
        "decisions",
        ("decision log", "extract decisions", "rozhodnutia", "log rozhodnuti", "co sme rozhodli"),
    ),
    (
        "quotes",
        ("extract quotes", "pull quotes", "citacie", "citáty", "vyber citaty"),
    ),
    (
        "pii",
        (
            "detect pii",
            "privacy scan",
            "personal data",
            "citlive udaje",
            "pii",
            "sken suckromia",
            "pred zdieľaním",
            "pred zdielanim",
        ),
    ),
    (
        "rank_tasks",
        (
            "rank tasks",
            "prioritize tasks",
            "prioritize todos",
            "zorad ulohy",
            "priorita uloh",
            "urgent tasks",
        ),
    ),
    (
        "contradictions",
        (
            "contradiction",
            "conflicting claims",
            "rozpory",
            "protirecenia",
            "nekonzistentne tvrdenia",
        ),
    ),
    (
        "commitments",
        (
            "commitment",
            "commitments",
            "i will",
            "follow up",
            "zavazky",
            "záväzky",
            "sluby",
            "sľuby",
            "co som slubil",
        ),
    ),
    (
        "reading_plan",
        (
            "reading plan",
            "study plan",
            "study path",
            "plan citania",
            "studijny plan",
            "študijný plán",
            "ako citat",
        ),
    ),
    (
        "note_pulse",
        (
            "note pulse",
            "note health",
            "library pulse",
            "stav poznamky",
            "zdravie poznamky",
            "pulse",
        ),
    ),
    (
        "grammar",
        (
            "grammar",
            "grammar check",
            "gramatika",
            "skontroluj gramatiku",
            "grammar tips",
        ),
    ),
    (
        "mentions",
        (
            "mentions",
            "people mentioned",
            "@mentions",
            "spomenute osoby",
            "kto je v poznamke",
            "attendees",
        ),
    ),
    (
        "open_loops",
        ("open loops", "unfinished", "loose ends", "otvorene slucky", "nedokoncene", "co ostava"),
    ),
    (
        "tone",
        ("tone", "readability", "reading time", "sentiment", "citelnost", "ton textu", "nalada textu"),
    ),
    (
        "title",
        ("suggest title", "rename note", "better title", "navrhni nazov", "premenuj", "lepsi nazov"),
    ),
    (
        "continuation",
        ("continue writing", "keep writing", "what next sentence", "pokracuj v pisani", "dalsia veta"),
    ),
    (
        "template_hints",
        ("template gaps", "missing sections", "template hints", "chyba sekcia", "dopln sablonu"),
    ),
    (
        "library_report",
        ("library report", "library health", "report kniznice", "stav kniznice"),
    ),
    (
        "terminology_library",
        (
            "library terminology",
            "term variants",
            "terminologia kniznice",
            "nekonzistentne pojmy",
        ),
    ),
]

_DOCUMENT_TOOLS = {
    "summarize",
    "outline",
    "keywords",
    "tasks",
    "dates",
    "meeting",
    "terminology",
    "wiki",
    "wiki_health",
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
    "section_summaries",
    "decisions",
    "quotes",
    "pii",
    "rank_tasks",
    "contradictions",
    "commitments",
    "reading_plan",
    "note_pulse",
    "grammar",
    "mentions",
    "open_loops",
    "tone",
    "title",
    "continuation",
    "template_hints",
    "save_template",
    "canvas_summarize",
    "canvas_to_note",
    "canvas_template",
    "document_answer",
    "code_brief",
}


def _fold(text: str) -> str:
    lowered = (text or "").strip().lower()
    # Strip combining marks (SK/CS diacritics) like Rust fold_intent.
    decomposed = unicodedata.normalize("NFD", lowered)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def _needle_hit(folded: str, needle: str) -> bool:
    """Substring match for phrases; token-prefix match for single words.

    Requires a word start (avoids tone∈stone) but allows plurals/suffixes
    (takeaway∈takeaways, task∈tasks) — closer to useful EN/SK stemming.
    """
    n = _fold(needle)
    if not n or not folded:
        return False
    # Phrases / paths / mentions keep substring semantics (aligned with Rust contains).
    if any(ch in n for ch in (" ", "/", "@")):
        return n in folded
    return re.search(rf"(?<![a-z0-9]){re.escape(n)}", folded) is not None


def match_agent_intents_scored(
    goal: str, *, max_tools: int = _AGENT_TOOL_LIMIT
) -> list[tuple[str, float]]:
    folded = _fold(goal)
    if not folded:
        return []
    limit = max(1, min(int(max_tools or _AGENT_TOOL_LIMIT), 6))
    scored: list[tuple[str, float, int]] = []
    for index, (tool, needles) in enumerate(_INTENT_RULES):
        hits = [needle for needle in needles if _needle_hit(folded, needle)]
        if not hits:
            continue
        # Longer / more specific needle ⇒ higher confidence.
        best = max(len(_fold(needle)) for needle in hits)
        multi = 0.06 if (" and " in folded or " a " in folded or " plus " in folded) else 0.0
        score = min(0.98, 0.42 + best / 28.0 + 0.08 * (len(hits) - 1) + multi)
        scored.append((tool, round(score, 3), index))
    # Prefer higher score; rule order breaks ties (Rust-like priority).
    scored.sort(key=lambda row: (-row[1], row[2]))
    return [(tool, score) for tool, score, _index in scored[:limit]]


def match_agent_intents(goal: str, *, max_tools: int = _AGENT_TOOL_LIMIT) -> list[str]:
    return [tool for tool, _score in match_agent_intents_scored(goal, max_tools=max_tools)]


def _apply_role_boosts(
    scored: list[tuple[str, float]],
    *,
    role: str | None,
    limit: int,
) -> list[tuple[str, float]]:
    if not role:
        return scored
    boosts = _ROLE_TOOL_BOOSTS.get(str(role).strip().lower(), ())
    if not boosts:
        return scored
    by_tool = {tool: score for tool, score in scored}
    for tool in boosts:
        if tool in by_tool:
            by_tool[tool] = min(0.98, round(by_tool[tool] + 0.12, 3))
        elif len(by_tool) < limit:
            # Soft-add role specialty when the goal was vague but a persona is set.
            by_tool[tool] = 0.5
    order = {tool: index for index, (tool, _needles) in enumerate(_INTENT_RULES)}
    ranked = sorted(
        by_tool.items(),
        key=lambda item: (-item[1], order.get(item[0], 999)),
    )
    return [(tool, score) for tool, score in ranked[:limit]]


def _default_clarify_options(scope: str) -> list[str]:
    if scope == "document":
        return ["summarize", "takeaways", "tasks", "dates", "document_answer"]
    return ["dates", "duplicates", "citations", "library_answer", "brief"]


def _clarify_from_jepa_candidates(jepa: dict[str, Any] | None, scope: str) -> list[str]:
    """Prefer top JEPA candidate primary tools over the fixed clarify list."""
    candidates = (jepa or {}).get("candidates") or []
    options: list[str] = []
    for cand in candidates[:5]:
        if not isinstance(cand, dict):
            continue
        tools = cand.get("tools") or []
        primary = None
        if isinstance(tools, list) and tools:
            primary = str(tools[0]).strip()
        elif cand.get("tool"):
            primary = str(cand.get("tool")).strip()
        if primary and primary not in options:
            options.append(primary)
        if len(options) >= 3:
            break
    if options:
        return options
    return _default_clarify_options(scope)


def plan_agent_goal(
    goal: str,
    *,
    scope: str = "document",
    max_tools: int = _AGENT_TOOL_LIMIT,
    llm: dict[str, Any] | None = None,
    role: str | None = None,
    context: str | None = None,
    allowed_tools: list[str] | None = None,
    handoffs: list[str] | None = None,
    feedback_tools: list[list[str]] | None = None,
    jepa_embed_fn: Any | None = None,
) -> dict[str, Any]:
    """Plan Local Agent tools from a free-form goal (EN/SK + JEPA-like + optional LLM)."""
    trimmed = (goal or "").strip()
    scope_norm = "library" if str(scope or "").lower().startswith("lib") else "document"
    limit = max(1, min(int(max_tools or _AGENT_TOOL_LIMIT), 6))
    scored = match_agent_intents_scored(trimmed, max_tools=max(limit, 6))

    if scope_norm == "library":
        scored = [(tool, score) for tool, score in scored if tool in _LIBRARY_TOOLS]

    if allowed_tools:
        allow = {str(item) for item in allowed_tools}
        scored = [(tool, score) for tool, score in scored if tool in allow]

    scored = _apply_role_boosts(scored, role=role, limit=limit)
    scored = scored[:limit]

    tools = [tool for tool, _score in scored]
    tool_scores = [{"tool": tool, "score": score} for tool, score in scored]
    confidence = max((score for _tool, score in scored), default=0.0)
    source = "python"
    needs = len(tools) == 0 or confidence < 0.48

    # JEPA-like latent ranking — prefer when confidence clears the threshold.
    jepa_meta: dict[str, Any] | None = None
    jepa_full: dict[str, Any] | None = None
    try:
        from .decision_jepa import score_decision_plans, should_prefer_jepa

        jepa = score_decision_plans(
            trimmed,
            scope=scope_norm,
            max_tools=limit,
            role=role,
            context=context,
            handoffs=handoffs,
            feedback_tools=feedback_tools,
            allowed_tools=allowed_tools,
            embed_fn=jepa_embed_fn,
        )
        jepa_full = jepa
        jepa_meta = {
            "confidence": jepa.get("confidence"),
            "margin": jepa.get("margin"),
            "topLabel": jepa.get("topLabel"),
            "ready": jepa.get("ready"),
            "candidates": jepa.get("candidates") or [],
        }
        if should_prefer_jepa(jepa):
            tools = list(jepa.get("tools") or [])
            tool_scores = list(jepa.get("toolScores") or [])
            confidence = float(jepa.get("confidence") or 0.0)
            source = "jepa"
            needs = len(tools) == 0
        elif needs and jepa.get("ready") and jepa.get("tools"):
            # Weak keyword match — use JEPA as soft fill even below prefer threshold
            # when keywords produced nothing useful.
            if confidence < 0.48:
                tools = list(jepa.get("tools") or [])
                tool_scores = list(jepa.get("toolScores") or [])
                confidence = float(jepa.get("confidence") or 0.0)
                source = "jepa"
                needs = len(tools) == 0
    except Exception:
        jepa_meta = None
        jepa_full = None

    # LLM last resort — skip when JEPA already won with a clear latent signal.
    jepa_margin = float((jepa_meta or {}).get("margin") or 0.0)
    jepa_locked = source == "jepa" and (
        (confidence >= 0.72 and jepa_margin >= 0.01)
        or (confidence >= 0.55 and jepa_margin >= 0.03)
    )
    if llm and (needs or confidence < 0.62) and not jepa_locked:
        llm_plan = _try_llm_plan(trimmed, scope=scope_norm, limit=limit, llm=llm)
        if llm_plan:
            tools = llm_plan["tools"]
            tool_scores = [{"tool": tool, "score": 0.8} for tool in tools]
            confidence = float(llm_plan.get("confidence") or 0.8)
            needs = len(tools) == 0
            source = "llm"

    needs_clarify = needs and len(tools) == 0
    clarify_options = (
        _clarify_from_jepa_candidates(jepa_full, scope_norm) if needs_clarify else []
    )
    clarify_labels: list[str] = []
    if needs_clarify and jepa_full:
        for cand in (jepa_full.get("candidates") or [])[:3]:
            if isinstance(cand, dict) and cand.get("label"):
                clarify_labels.append(str(cand["label"]))

    result: dict[str, Any] = {
        "goal": trimmed,
        "scope": scope_norm,
        "tools": [] if needs_clarify else tools,
        "toolScores": tool_scores,
        "confidence": confidence,
        "needsClarification": needs_clarify,
        "clarifyOptions": clarify_options,
        "clarifyLabels": clarify_labels,
        "source": source,
        "topLabel": (jepa_meta or {}).get("topLabel") if source == "jepa" else None,
    }
    if jepa_meta is not None:
        result["jepa"] = jepa_meta
    return result


_ALLOWED_PLAN_TOOLS = _DOCUMENT_TOOLS | _LIBRARY_TOOLS | {
    "library_answer",
    "duplicates",
    "citations",
    "brief",
    "files_ingest",
    "keywords",
    "handoff",
    "wiki_health",
    "canvas_summarize",
    "canvas_to_note",
    "canvas_template",
    "save_template",
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
        if scope != "library" or tool in _LIBRARY_TOOLS
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


def _run_brief_tool(tool: str, source: str, limit: int) -> dict[str, Any] | None:
    """Execute one brief tool; returns a section dict or None when skipped/empty."""
    try:
        if tool == "summarize":
            from .summarize import summarize_text

            result = summarize_text(source, max_sentences=min(4, limit))
            summary = str(result.get("summary") or "").strip()
            return _section("summarize", summary) if summary else None
        if tool == "outline":
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
            return _section("outline", "\n".join(lines)) if lines else None
        if tool == "keywords":
            from .keywords import extract_keywords

            result = extract_keywords(source, limit=limit)
            words = [
                str(item.get("term") or item.get("keyword") or item)
                for item in (result.get("keywords") or [])[:limit]
            ]
            phrases = [
                str(item.get("phrase") or "")
                for item in (result.get("keyphrases") or [])[:limit]
                if item.get("phrase")
            ]
            lines = []
            if words:
                lines.append("Keywords: " + ", ".join(words))
            if phrases:
                lines.append("Phrases: " + ", ".join(phrases))
            return _section("keywords", "\n".join(lines)) if lines else None
        if tool == "tasks":
            from .tasks import extract_tasks

            result = extract_tasks(source)
            open_tasks = [
                item for item in (result.get("tasks") or []) if not item.get("checked")
            ][:limit]
            if not open_tasks:
                return None
            lines = [
                f"- {item.get('text')}"
                + (f" _(due {item.get('dueHint')})_" if item.get("dueHint") else "")
                for item in open_tasks
                if item.get("text")
            ]
            return _section("tasks", "\n".join(lines)) if lines else None
        if tool == "dates":
            from .dates import extract_dates

            result = extract_dates(source)
            dates = (result.get("events") or result.get("dates") or [])[:limit]
            if not dates:
                return None
            lines = [
                f"- {item.get('text')}"
                + (f" ({item.get('kind')})" if item.get("kind") else "")
                for item in dates
                if item.get("text")
            ]
            return _section("dates", "\n".join(lines)) if lines else None
        if tool == "takeaways":
            from .takeaways import extract_takeaways

            result = extract_takeaways(source, limit=limit)
            items = result.get("takeaways") or []
            if not items:
                return None
            lines = [f"- {item.get('text')}" for item in items if item.get("text")]
            header = result.get("summary") or ""
            body = (f"{header}\n\n" if header else "") + "\n".join(lines)
            return _section("takeaways", body)
        if tool == "meeting":
            from .meeting_notes import meeting_notes_pack

            result = meeting_notes_pack(source, limit=limit)
            chunks: list[str] = []
            if result.get("attendees"):
                chunks.append(
                    "**Attendees**\n" + "\n".join(f"- {name}" for name in result["attendees"][:12])
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
            return _section("meeting", "\n\n".join(chunks)) if chunks else None
        if tool == "terminology":
            from .terminology import check_terminology

            result = check_terminology(source, limit=limit)
            issues = result.get("issues") or []
            if not issues:
                return None
            lines = []
            for item in issues[:limit]:
                canonical = item.get("canonical") or ""
                variants = ", ".join(
                    v.get("term") or ""
                    for v in (item.get("variants") or [])[:4]
                    if v.get("term")
                )
                lines.append(f"- **{canonical}** ↔ {variants}".strip(" ↔"))
            return _section("terminology", "\n".join(lines))
        if tool == "flashcards":
            from .flashcards import extract_flashcards

            result = extract_flashcards(source, limit=min(limit, 8))
            cards = result.get("cards") or []
            if not cards:
                return None
            lines = []
            for index, card in enumerate(cards[:limit], start=1):
                q = card.get("question") or card.get("front") or ""
                a = card.get("answer") or ""
                lines.append(f"**Q{index}.** {q}" + (f"\n  → {a}" if a else ""))
            return _section("flashcards", "\n\n".join(lines))
        if tool == "quiz":
            from .outline_quiz import outline_quiz

            result = outline_quiz(source, limit=min(limit, 8))
            questions = result.get("questions") or []
            if not questions:
                return None
            lines = []
            for index, item in enumerate(questions[:limit], start=1):
                q = item.get("question") or ""
                a = item.get("answer") or ""
                lines.append(f"**Q{index}.** {q}" + (f"\n  → {a}" if a else ""))
            return _section("quiz", "\n\n".join(lines))
        if tool == "style":
            from .writing_coach import writing_coach

            result = writing_coach(source, limit=limit)
            hints = result.get("hints") or []
            if not hints:
                return None
            lines = [
                f"- {item.get('message') or item.get('code')}"
                for item in hints[:limit]
                if item.get("message") or item.get("code")
            ]
            return _section("style", "\n".join(lines)) if lines else None
        if tool == "explain":
            from .note_skills import explain_selection

            result = explain_selection(source)
            text_out = (result.get("explanation") or "").strip()
            return _section("explain", text_out) if text_out else None
        if tool == "code_brief":
            from .code_ops import code_brief

            result = code_brief(source)
            text_out = (result.get("answer") or result.get("brief") or "").strip()
            return _section("code_brief", text_out) if text_out else None
        if tool == "simplify":
            from .note_skills import simplify_text

            result = simplify_text(source)
            text_out = (result.get("simplified") or result.get("text") or "").strip()
            return _section("simplify", text_out) if text_out else None
        if tool == "action_items":
            from .note_skills import action_items_from_text

            result = action_items_from_text(source, limit=limit)
            items = result.get("items") or result.get("actionItems") or []
            if not items:
                return None
            lines = [
                f"- {item.get('text') or item}" if isinstance(item, dict) else f"- {item}"
                for item in items[:limit]
            ]
            return _section("action_items", "\n".join(lines))
        if tool == "glossary":
            from .note_skills import glossary_from_text

            result = glossary_from_text(source, limit=limit)
            entries = result.get("entries") or result.get("terms") or []
            if not entries:
                return None
            lines = []
            for entry in entries[:limit]:
                if isinstance(entry, dict):
                    term = entry.get("term") or ""
                    definition = entry.get("definition") or ""
                    lines.append(f"- **{term}** — {definition}".strip(" —"))
                else:
                    lines.append(f"- {entry}")
            return _section("glossary", "\n".join(lines))
        if tool == "spellcheck":
            from .spellcheck import spellcheck_text

            result = spellcheck_text(source, max_issues=limit)
            issues = result.get("issues") or []
            if not issues:
                return None
            lines = []
            for item in issues[:limit]:
                word = item.get("word") or ""
                suggestions = ", ".join((item.get("suggestions") or [])[:3])
                lines.append(f"- {word}" + (f" → {suggestions}" if suggestions else ""))
            return _section("spellcheck", "\n".join(lines))
        if tool == "section_summaries":
            from .section_summaries import section_summaries

            result = section_summaries(source, limit=limit)
            items = result.get("sections") or []
            if not items:
                return None
            lines = [
                f"**{item.get('title') or 'Section'}** — {item.get('summary') or ''}".strip(" —")
                for item in items[:limit]
            ]
            return _section("section_summaries", "\n".join(lines))
        if tool == "decisions":
            from .decisions import extract_decisions

            result = extract_decisions(source, limit=limit)
            items = result.get("decisions") or []
            if not items:
                return None
            lines = [f"- {item.get('text') or item}" for item in items[:limit]]
            return _section("decisions", "\n".join(lines))
        if tool == "quotes":
            from .quotes import extract_quotes

            result = extract_quotes(source, limit=limit)
            items = result.get("quotes") or []
            if not items:
                return None
            lines = [f"> {item.get('text') or item}" for item in items[:limit]]
            return _section("quotes", "\n\n".join(lines))
        if tool == "pii":
            from .pii import detect_pii

            result = detect_pii(source, limit=limit)
            findings = result.get("findings") or []
            risk = result.get("risk") or "none"
            if findings:
                lines = [f"Risk: **{risk}**"] + [
                    f"- {item.get('label') or item.get('kind')}: `{item.get('match')}`"
                    for item in findings[:limit]
                ]
                return _section("pii", "\n".join(lines))
            return _section("pii", f"Risk: **{risk}** — no PII detected.")
        if tool == "rank_tasks":
            from .task_rank import rank_tasks

            result = rank_tasks(source, limit=limit)
            items = result.get("tasks") or []
            if not items:
                return None
            lines = [
                f"- ({item.get('score')}) {item.get('text')}"
                + (f" — due {item.get('dueHint')}" if item.get("dueHint") else "")
                for item in items[:limit]
            ]
            return _section("rank_tasks", "\n".join(lines))
        if tool == "commitments":
            from .commitments import extract_commitments

            result = extract_commitments(source, limit=limit)
            items = result.get("commitments") or []
            if not items:
                return None
            lines = [f"- {item.get('text') or item}" for item in items[:limit]]
            return _section("commitments", "\n".join(lines))
        if tool == "reading_plan":
            from .reading_plan import reading_plan

            result = reading_plan(source, limit=limit)
            items = result.get("steps") or []
            if not items:
                return None
            lines = [
                f"{item.get('order')}. **{item.get('title')}** "
                f"({item.get('estimatedMinutes')}m) — {item.get('focus')}"
                for item in items[:limit]
            ]
            return _section("reading_plan", "\n".join(lines))
        if tool == "note_pulse":
            from .note_pulse import note_pulse

            result = note_pulse(source)
            return _section(
                "note_pulse",
                f"Score **{result.get('score')}**/100 — {result.get('summary')}",
            )
        if tool == "open_loops":
            from .open_loops import open_loops

            result = open_loops(source, limit=limit)
            items = result.get("loops") or []
            if not items:
                return None
            lines = [
                f"- {item.get('text') or item}" if isinstance(item, dict) else f"- {item}"
                for item in items[:limit]
            ]
            return _section("open_loops", "\n".join(lines))
        if tool == "tone":
            from .tone import tone_pack

            result = tone_pack(source)
            summary = (result.get("summary") or "").strip()
            hints = result.get("hints") or []
            parts = [summary] if summary else []
            if hints:
                parts.append("Hints: " + ", ".join(str(h) for h in hints[:limit]))
            return _section("tone", "\n".join(parts)) if parts else None
        if tool == "title":
            from .title import suggest_title

            result = suggest_title(source)
            title = (result.get("title") or "").strip()
            slug = (result.get("slug") or "").strip()
            if not title:
                return None
            body = title + (f"\n`{slug}`" if slug else "")
            return _section("title", body)
        if tool == "continuation":
            from .continuation import suggest_continuation

            result = suggest_continuation(source[-800:], max_suggestions=min(limit, 5))
            suggestions = result.get("suggestions") or []
            if not suggestions:
                return None
            lines = [
                f"- {item.get('text') or item}" if isinstance(item, dict) else f"- {item}"
                for item in suggestions[:limit]
            ]
            return _section("continuation", "\n".join(lines))
        if tool == "template_hints":
            from .template_hints import template_fill_hints

            result = template_fill_hints(source)
            missing = result.get("missing") or []
            present = result.get("present") or []
            lines = []
            if missing:
                lines.append("Missing: " + ", ".join(str(m) for m in missing[:limit]))
            if present:
                lines.append("Present: " + ", ".join(str(p) for p in present[:limit]))
            cov = result.get("coverage")
            if cov is not None:
                lines.append(f"Coverage: {cov}")
            return _section("template_hints", "\n".join(lines)) if lines else None
        if tool == "mentions":
            from .mentions import extract_mentions

            result = extract_mentions(source)
            names = list(result.get("mentions") or [])[:limit]
            wiki = list(result.get("wikiLinks") or [])[:limit]
            lines = []
            if names:
                lines.append("People: " + ", ".join(f"@{n}" for n in names))
            if wiki:
                lines.append("Wiki: " + ", ".join(wiki))
            return _section("mentions", "\n".join(lines)) if lines else None
        # grammar / similar / wiki / organize / revision / rewrite / document_answer /
        # compare_notes / contradictions need library or editor context — skip.
        return None
    except Exception:  # noqa: BLE001 — soft-fail per tool like the FE agent loop
        return None


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

    finished: dict[str, dict[str, Any]] = {}
    workers = min(4, max(1, len(planned)))
    if len(planned) == 1:
        section = _run_brief_tool(planned[0], source, limit)
        if section:
            finished[planned[0]] = section
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(_run_brief_tool, tool, source, limit): tool for tool in planned
            }
            for fut in as_completed(futures):
                tool = futures[fut]
                try:
                    section = fut.result()
                except Exception:  # noqa: BLE001
                    continue
                if section:
                    finished[tool] = section

    sections = [finished[tool] for tool in planned if tool in finished]
    answer_parts = [f"### {item['tool']}\n\n{item['markdown']}" for item in sections]
    return {
        "goal": (goal or "").strip(),
        "tools": planned,
        "sections": sections,
        "answer": "\n\n".join(answer_parts),
        "count": len(sections),
        "source": "python",
    }
