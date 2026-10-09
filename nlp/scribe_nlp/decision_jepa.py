"""JEPA-like latent decision scorer for Local Agent planning.

Encodes the goal/state and candidate tool-plan futures into the existing
embedding space, then ranks candidates by cosine similarity (non-autoregressive
choice). Soft-fails when only the hash embed backend is active — keyword/LLM
planners remain the fallback.
"""

from __future__ import annotations

import math
from typing import Any, Callable

from .embed import cosine_similarity, embed_batch
from .embed_backend import active_backend

EmbedFn = Callable[[list[str]], list[list[float]]]

# Prefer JEPA ranking when top similarity clears this bar.
JEPA_CONFIDENCE_THRESHOLD = 0.55
# Minimum gap between #1 and #2 before we trust a clear winner.
JEPA_MARGIN_THRESHOLD = 0.03

_Candidate = dict[str, Any]


def _document_catalog() -> list[_Candidate]:
    return [
        {
            "tools": ["summarize"],
            "label": "summarize this note into short bullets",
        },
        {
            "tools": ["takeaways"],
            "label": "extract key takeaways and important points",
        },
        {
            "tools": ["outline"],
            "label": "build an outline of headings and structure",
        },
        {
            "tools": ["tasks", "action_items"],
            "label": "extract action items and open tasks",
        },
        {
            "tools": ["meeting", "tasks"],
            "label": "meeting notes wrap-up with decisions and action items",
        },
        {
            "tools": ["decisions"],
            "label": "extract the decision log from meeting notes",
        },
        {
            "tools": ["dates"],
            "label": "find deadlines dates and schedule items",
        },
        {
            "tools": ["spellcheck", "grammar"],
            "label": "spellcheck and grammar polish the writing",
        },
        {
            "tools": ["rewrite"],
            "label": "rewrite and polish the prose style",
        },
        {
            "tools": ["flashcards", "quiz"],
            "label": "study pass with flashcards and quiz questions",
        },
        {
            "tools": ["glossary"],
            "label": "build a glossary of terms from this note",
        },
        {
            "tools": ["reading_plan"],
            "label": "make a reading plan for studying this document",
        },
        {
            "tools": ["section_summaries"],
            "label": "summarize each section of the document",
        },
        {
            "tools": ["wiki", "organize"],
            "label": "suggest wiki links folders and organization",
        },
        {
            "tools": ["duplicates", "similar"],
            "label": "find duplicate or related notes",
        },
        {
            "tools": ["pii"],
            "label": "privacy scan for personal data before sharing",
        },
        {
            "tools": ["terminology"],
            "label": "check terminology consistency across the note",
        },
        {
            "tools": ["document_answer"],
            "label": "answer a question about this document",
        },
        {
            "tools": ["explain"],
            "label": "explain a difficult passage in simpler words",
        },
        {
            "tools": ["handoff"],
            "label": "handoff action items to the organizer agent",
        },
        {
            "tools": ["brief"],
            "label": "produce a short daily brief of this note",
        },
        {
            "tools": ["open_loops"],
            "label": "find open loops unfinished threads and commitments",
        },
        {
            "tools": ["title"],
            "label": "suggest a better title for this note",
        },
        {
            "tools": ["tone"],
            "label": "analyze tone and readability of the writing",
        },
    ]


def _library_catalog() -> list[_Candidate]:
    return [
        {
            "tools": ["library_answer"],
            "label": "answer a question across the whole library",
        },
        {
            "tools": ["brief"],
            "label": "daily or weekly digest across notes",
        },
        {
            "tools": ["dates"],
            "label": "find upcoming deadlines across the library",
        },
        {
            "tools": ["duplicates"],
            "label": "find near-duplicate notes in the library",
        },
        {
            "tools": ["citations"],
            "label": "find sources and citations for a claim",
        },
        {
            "tools": ["similar"],
            "label": "find related notes that connect to this topic",
        },
        {
            "tools": ["tasks"],
            "label": "collect open tasks across notes",
        },
        {
            "tools": ["takeaways"],
            "label": "gather key takeaways across the library",
        },
        {
            "tools": ["summarize"],
            "label": "summarize themes across recent notes",
        },
        {
            "tools": ["library_report"],
            "label": "produce a library health report",
        },
        {
            "tools": ["terminology_library"],
            "label": "check terminology consistency across the library",
        },
        {
            "tools": ["open_loops"],
            "label": "find open loops across the library",
        },
        {
            "tools": ["files_answer"],
            "label": "answer from files in the sandbox folder",
        },
        {
            "tools": ["handoff"],
            "label": "handoff a summary to another specialist agent",
        },
    ]


def jepa_backend_ready() -> bool:
    """True when a semantic embed backend is active (not hash-only)."""
    backend = active_backend()
    return backend in ("fast", "quality")


# When pending handoffs exist, nudge candidates that match the receiving role.
_ROLE_HANDOFF_TOOLS: dict[str, tuple[str, ...]] = {
    "general": ("library_answer", "document_answer", "summarize", "brief", "tasks"),
    "proofreader": ("spellcheck", "grammar", "rewrite", "terminology", "tone"),
    "librarian": ("brief", "dates", "library_answer", "library_report", "open_loops", "files_answer"),
    "meeting": ("meeting", "tasks", "action_items", "decisions", "commitments", "takeaways"),
    "study": ("outline", "glossary", "flashcards", "quiz", "reading_plan", "section_summaries"),
    "organizer": ("organize", "wiki", "duplicates", "pii", "tasks", "similar", "title"),
}

_HANDOFF_SCORE_BOOST = 0.08
_FEEDBACK_SCORE_BOOST = 0.06


def _build_state_text(
    goal: str,
    *,
    scope: str,
    role: str | None,
    context: str | None,
    handoffs: list[str] | None = None,
) -> str:
    parts = [f"User goal: {(goal or '').strip()}"]
    parts.append(f"Scope: {scope}")
    if role:
        parts.append(f"Active agent role: {role}")
    pulse = (context or "").strip()
    if pulse:
        parts.append(f"Note context: {pulse[:400]}")
    pending = [item.strip() for item in (handoffs or []) if item and item.strip()]
    if pending:
        body = "; ".join(pending[:4])[:500]
        parts.append(f"Pending handoffs to act on: {body}")
    return "\n".join(parts)


def _filter_catalog(
    catalog: list[_Candidate],
    allowed_tools: set[str] | None,
) -> list[_Candidate]:
    if not allowed_tools:
        return catalog
    filtered: list[_Candidate] = []
    for item in catalog:
        tools = [tool for tool in item["tools"] if tool in allowed_tools]
        if not tools:
            continue
        filtered.append({"tools": tools, "label": item["label"]})
    return filtered


def _l2_normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if norm <= 1e-12:
        return vector
    return [value / norm for value in vector]


def _apply_role_handoff_boost(
    scored: list[tuple[list[str], str, float]],
    *,
    role: str | None,
    handoffs: list[str] | None,
) -> list[tuple[list[str], str, float]]:
    if not handoffs:
        return scored
    hints = _ROLE_HANDOFF_TOOLS.get((role or "general").strip().lower(), ())
    if not hints:
        return scored
    hint_set = set(hints)
    boosted: list[tuple[list[str], str, float]] = []
    for tools, label, score in scored:
        bump = _HANDOFF_SCORE_BOOST if any(tool in hint_set for tool in tools) else 0.0
        boosted.append((tools, label, round(min(0.99, score + bump), 4)))
    boosted.sort(key=lambda row: row[2], reverse=True)
    return boosted


def _apply_feedback_boost(
    scored: list[tuple[list[str], str, float]],
    feedback_tools: list[list[str]] | None,
) -> list[tuple[list[str], str, float]]:
    if not feedback_tools:
        return scored
    # Tools that succeeded when the user applied an answer.
    wins: set[str] = set()
    for row in feedback_tools[:24]:
        for tool in row:
            if tool:
                wins.add(str(tool))
    if not wins:
        return scored
    boosted: list[tuple[list[str], str, float]] = []
    for tools, label, score in scored:
        overlap = sum(1 for tool in tools if tool in wins)
        bump = min(_FEEDBACK_SCORE_BOOST * 2, overlap * _FEEDBACK_SCORE_BOOST)
        boosted.append((tools, label, round(min(0.99, score + bump), 4)))
    boosted.sort(key=lambda row: row[2], reverse=True)
    return boosted


def score_decision_plans(
    goal: str,
    *,
    scope: str = "document",
    max_tools: int = 3,
    role: str | None = None,
    context: str | None = None,
    handoffs: list[str] | None = None,
    feedback_tools: list[list[str]] | None = None,
    allowed_tools: set[str] | list[str] | None = None,
    embed_fn: EmbedFn | None = None,
    force_hash: bool = False,
) -> dict[str, Any]:
    """Rank candidate tool plans in latent space.

    Returns tools, toolScores, confidence, candidates, and source=\"jepa\".
    Empty tools when the scorer cannot run or finds no signal.
    """
    trimmed = (goal or "").strip()
    scope_norm = "library" if str(scope or "").lower().startswith("lib") else "document"
    limit = max(1, min(int(max_tools or 3), 6))
    empty = {
        "goal": trimmed,
        "scope": scope_norm,
        "tools": [],
        "toolScores": [],
        "candidates": [],
        "confidence": 0.0,
        "source": "jepa",
        "ready": False,
    }
    if len(trimmed) < 2:
        return empty

    if embed_fn is None and not force_hash and not jepa_backend_ready():
        return empty

    catalog = _library_catalog() if scope_norm == "library" else _document_catalog()
    allowed = set(allowed_tools) if allowed_tools else None
    catalog = _filter_catalog(catalog, allowed)
    if not catalog:
        return empty

    state_text = _build_state_text(
        trimmed,
        scope=scope_norm,
        role=role,
        context=context,
        handoffs=handoffs,
    )
    labels = [item["label"] for item in catalog]
    texts = [state_text, *labels]

    try:
        encode = embed_fn or embed_batch
        vectors = encode(texts)
    except Exception:
        return empty

    if not vectors or len(vectors) != len(texts):
        return empty

    state_vec = _l2_normalize(vectors[0])
    scored: list[tuple[list[str], str, float]] = []
    for index, item in enumerate(catalog):
        cand_vec = _l2_normalize(vectors[index + 1])
        score = max(0.0, float(cosine_similarity(state_vec, cand_vec)))
        scored.append((list(item["tools"]), str(item["label"]), round(score, 4)))

    scored.sort(key=lambda row: row[2], reverse=True)
    scored = _apply_role_handoff_boost(scored, role=role, handoffs=handoffs)
    scored = _apply_feedback_boost(scored, feedback_tools)
    if not scored:
        return empty

    top_score = scored[0][2]
    second = scored[1][2] if len(scored) > 1 else 0.0
    margin = top_score - second

    candidates = [
        {
            "tools": plan_tools,
            "label": label,
            "score": score,
            "tool": plan_tools[0] if plan_tools else None,
        }
        for plan_tools, label, score in scored[:5]
    ]

    # Flatten unique tools in ranked order.
    tools: list[str] = []
    tool_scores: list[dict[str, Any]] = []
    seen: set[str] = set()
    for plan_tools, _label, score in scored:
        for tool in plan_tools:
            if tool in seen:
                continue
            seen.add(tool)
            tools.append(tool)
            tool_scores.append({"tool": tool, "score": score})
            if len(tools) >= limit:
                break
        if len(tools) >= limit:
            break

    confidence = round(min(0.98, top_score + min(0.08, margin)), 4)
    return {
        "goal": trimmed,
        "scope": scope_norm,
        "tools": tools,
        "toolScores": tool_scores,
        "candidates": candidates,
        "confidence": confidence,
        "margin": round(margin, 4),
        "topLabel": scored[0][1],
        "source": "jepa",
        "ready": True,
    }


def should_prefer_jepa(result: dict[str, Any]) -> bool:
    """Whether the JEPA ranking is confident enough to override keywords."""
    if not result or not result.get("ready"):
        return False
    if not result.get("tools"):
        return False
    confidence = float(result.get("confidence") or 0.0)
    margin = float(result.get("margin") or 0.0)
    # Strong absolute match: two close meeting-like candidates still beat keywords.
    if confidence >= 0.72 and margin >= 0.01:
        return True
    return confidence >= JEPA_CONFIDENCE_THRESHOLD and margin >= JEPA_MARGIN_THRESHOLD
