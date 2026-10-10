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
    ]
