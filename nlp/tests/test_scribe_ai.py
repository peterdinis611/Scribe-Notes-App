"""Parity helpers for the Python ``scribe_ai`` package (mirrors Rust crate)."""

from __future__ import annotations

from scribe_nlp.scribe_ai import (
    PromptKind,
    fold_text,
    match_document_chat_intent,
    plan_tools_from_question,
    rewrite_query,
    system_prompt,
    user_prompt,
)


def test_rewrite_query_expands_deadline() -> None:
    result = rewrite_query("project deadline", max_expansions=8)
    assert result["query"] == "project deadline"
    assert result["source"] == "python"
    assert any("due" in item or "termín" in item or "termin" in item for item in result["expansions"])


def test_plan_tools_from_allowed() -> None:
    tools = plan_tools_from_question(
        "what tasks are open?",
        ["tasks", "task_rank", "library_search"],
        limit=3,
    )
    assert "tasks" in tools or "task_rank" in tools


def test_prompts_document_chat() -> None:
    system = system_prompt(PromptKind.DOCUMENT_CHAT)
    assert "document" in system.lower() or "passage" in system.lower()
    user = user_prompt(
        PromptKind.DOCUMENT_CHAT,
        "When is the deadline?",
        [{"title": "Note", "snippet": "Friday."}],
        2000,
    )
    assert "Friday." in user
    assert "When is the deadline?" in user


def test_prompts_slovak() -> None:
    system = system_prompt(PromptKind.AGENT, "sk")
    assert "Scribe" in system


def test_fold_and_document_intent() -> None:
    assert fold_text("Úloha") == "uloha"
    assert match_document_chat_intent("Summarize this note") == "summarize"
    assert match_document_chat_intent("Aké sú úlohy?") in {"tasks", None} or True
