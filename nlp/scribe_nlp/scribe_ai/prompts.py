"""Stable system / user prompt builders (parity with Rust ``scribe-ai::prompts``)."""

from __future__ import annotations

import json
from enum import Enum
from typing import Any

DEFAULT_PASSAGE_CHAR_BUDGET = 12_000


class PromptKind(str, Enum):
    DOCUMENT_CHAT = "document_chat"
    LIBRARY_CHAT = "library_chat"
    AGENT = "agent"
    REWRITE = "rewrite"


def _is_sk(language: str | None) -> bool:
    return bool(language and language.strip().lower().startswith("sk"))


def system_prompt(kind: PromptKind | str, language: str | None = None) -> str:
    sk = _is_sk(language)
    key = PromptKind(kind) if not isinstance(kind, PromptKind) else kind
    if key is PromptKind.DOCUMENT_CHAT:
        return (
            "Si asistent poznámky v Scribe. Odpovedaj len z poskytnutých pasáží. "
            "Cituj názvy, keď ich použiješ. Ak odpoveď v poznámke nie je, povedz to."
            if sk
            else "You are Scribe's document assistant. Answer only from the provided note passages. "
            "Cite titles when you use a passage. If the note does not contain the answer, say so."
        )
    if key is PromptKind.LIBRARY_CHAT:
        return (
            "Si asistent knižnice Scribe. Použi zoradené pasáže z poznámok. "
            "Preferuj presné citácie. Nevymýšľaj dokumenty."
            if sk
            else "You are Scribe's library assistant. Use the ranked passages across notes. "
            "Prefer precise citations. Do not invent documents."
        )
    if key is PromptKind.AGENT:
        return (
            "Si lokálny agent plánovač Scribe. Navrhni konkrétne nástroje a krátke odpovede. "
            "Zostaň v kontexte knižnice používateľa."
            if sk
            else "You are Scribe's local agent planner. Propose concrete next tools and short answers. "
            "Stay within the user's library context."
        )
    return (
        "Prepíšeš text poznámky. Zachovaj význam a štruktúru, pokiaľ nie je povedané inak. "
        "Vráť len prepísaný text."
        if sk
        else "You rewrite the user's note text. Preserve meaning and structure unless asked otherwise. "
        "Return only the rewritten text."
    )


def _trim_passages(passages: Any, budget: int) -> str:
    raw = json.dumps(passages if passages is not None else [], ensure_ascii=False)
    if len(raw) <= budget:
        return raw
    if isinstance(passages, list):
        kept: list[Any] = []
        size = 2  # []
        for item in passages:
            chunk = json.dumps(item, ensure_ascii=False)
            if size + len(chunk) + (1 if kept else 0) > budget:
                break
            kept.append(item)
            size += len(chunk) + (1 if len(kept) > 1 else 0)
        return json.dumps(kept, ensure_ascii=False)
    return raw[:budget]


def user_prompt(
    kind: PromptKind | str,
    question_or_text: str,
    passages: Any | None = None,
    char_budget: int | None = None,
) -> str:
    q = (question_or_text or "").strip()
    key = PromptKind(kind) if not isinstance(kind, PromptKind) else kind
    if key is PromptKind.REWRITE:
        return q
    budget = char_budget if char_budget and char_budget > 0 else DEFAULT_PASSAGE_CHAR_BUDGET
    body = _trim_passages(passages, budget)
    return f"Question:\n{q}\n\nPassages (JSON):\n{body}"
