"""Agent role + recipe catalogs (`crates/scribe-ui/src/agent_catalog.rs`)."""

from __future__ import annotations

from typing import TypedDict

AGENT_ROLE_IDS: tuple[str, ...] = (
    "general",
    "proofreader",
    "librarian",
    "meeting",
    "study",
    "organizer",
    "developer",
    "researcher",
)

AGENT_RECIPE_IDS: tuple[str, ...] = (
    "daily_digest",
    "weekly_review",
    "meeting_wrap",
    "study_pass",
    "cleanup",
    "privacy_pass",
    "polish",
    "deep_read",
    "files_digest",
    "note_to_template",
    "spellcheck",
    "wiki_cleanup",
    "canvas_board",
    "files_learn",
    "files_to_library",
    "code_pass",
    "code_audit",
    "morning_brief",
    "polish_and_apply",
    "research_pass",
    "deep_research",
)


class AgentRecipeDef(TypedDict):
    id: str
    labelKey: str
    tools: list[str]
    documentPreferred: bool


def agent_role_ids() -> list[str]:
    return list(AGENT_ROLE_IDS)


def agent_recipe_ids() -> list[str]:
    return list(AGENT_RECIPE_IDS)


def is_agent_role_id(value: str) -> bool:
    return value in AGENT_ROLE_IDS


def is_agent_recipe_id(value: str) -> bool:
    return value in AGENT_RECIPE_IDS


def _recipe(
    recipe_id: str,
    label_key: str,
    tools: list[str],
    document_preferred: bool,
) -> AgentRecipeDef:
    return {
        "id": recipe_id,
        "labelKey": label_key,
        "tools": list(tools),
        "documentPreferred": document_preferred,
    }


def agent_recipes() -> list[AgentRecipeDef]:
    return [
        _recipe("daily_digest", "agent.recipes.dailyDigest", ["brief"], False),
        _recipe(
            "weekly_review",
            "agent.recipes.weeklyReview",
            ["library_report", "terminology_library", "dates"],
            False,
        ),
        _recipe(
            "meeting_wrap",
            "agent.recipes.meetingWrap",
            ["meeting", "decisions", "open_loops", "rank_tasks"],
            True,
        ),
        _recipe(
            "note_to_template",
            "agent.recipes.noteToTemplate",
            ["template_hints", "outline", "save_template"],
            True,
        ),
        _recipe(
            "study_pass",
            "agent.recipes.studyPass",
            ["outline", "reading_plan", "quiz"],
            True,
        ),
        _recipe(
            "deep_read",
            "agent.recipes.deepRead",
            ["section_summaries", "tone", "takeaways", "flashcards"],
            True,
        ),
        _recipe("files_digest", "agent.recipes.filesDigest", ["files_answer"], False),
        _recipe(
            "cleanup",
            "agent.recipes.cleanup",
            ["duplicates", "title", "organize"],
            False,
        ),
        _recipe(
            "privacy_pass",
            "agent.recipes.privacyPass",
            ["pii", "duplicates", "organize"],
            False,
        ),
        _recipe("spellcheck", "agent.recipes.spellcheck", ["spellcheck"], True),
        _recipe(
            "polish",
            "agent.recipes.polish",
            ["spellcheck", "grammar", "tone"],
            True,
        ),
        _recipe(
            "wiki_cleanup",
            "agent.recipes.wikiCleanup",
            ["wiki_health", "wiki", "organize"],
            True,
        ),
        _recipe(
            "canvas_board",
            "agent.recipes.canvasBoard",
            ["canvas_summarize", "canvas_to_note"],
            True,
        ),
        _recipe(
            "files_learn",
            "agent.recipes.filesLearn",
            ["files_answer", "files_ingest"],
            False,
        ),
        _recipe(
            "files_to_library",
            "agent.recipes.filesToLibrary",
            ["files_ingest", "brief", "organize"],
            False,
        ),
        _recipe(
            "code_pass",
            "agent.recipes.codePass",
            ["code_brief", "explain", "outline", "keywords"],
            True,
        ),
        _recipe(
            "code_audit",
            "agent.recipes.codeAudit",
            ["code_brief", "pii", "glossary"],
            True,
        ),
        _recipe(
            "morning_brief",
            "agent.recipes.morningBrief",
            ["dates", "open_loops", "forward_plan"],
            True,
        ),
        _recipe(
            "polish_and_apply",
            "agent.recipes.polishAndApply",
            ["grammar", "spellcheck", "rewrite"],
            True,
        ),
        _recipe(
            "research_pass",
            "agent.recipes.researchPass",
            ["research_pack", "timeline"],
            True,
        ),
        _recipe(
            "deep_research",
            "agent.recipes.deepResearch",
            ["research_pack", "citations", "similar", "timeline"],
            True,
        ),
    ]
