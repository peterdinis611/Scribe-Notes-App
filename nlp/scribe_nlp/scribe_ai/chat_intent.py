"""Document + agent intent router — parity surface with Rust ``scribe-ai::chat_intent``.

Full EN/SK rules live in Rust; this module keeps a practical subset for Python hosts
and reuses ``tool_plan.match_agent_intents``.
"""

from __future__ import annotations

from .normalize import fold_text
from .tool_plan import match_agent_intents

_DOCUMENT_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("summarize", ("summar", "tl;dr", "zhrn", "súhrn", "suhrn", "overview")),
    ("tasks", ("task", "todo", "úloha", "uloha", "checklist", "action item")),
    ("dates", ("when", "deadline", "termín", "termin", "timeline", "dátum", "datum")),
    ("mentions", ("who", "mention", "osoba", "people", "mentioned")),
    ("flashcards", ("flashcard", "kartič", "kartic", "quiz")),
    ("takeaways", ("takeaway", "key point", "ponauč", "ponauc")),
    ("rewrite", ("rewrite", "polish", "prepíš", "prepis")),
    ("similar", ("similar", "related", "connect", "prepoj", "wiki")),
]


def match_document_chat_intent(question: str) -> str | None:
    hay = fold_text(question or "")
    if not hay:
        return None
    for action, needles in _DOCUMENT_RULES:
        if any(fold_text(n) in hay for n in needles):
            return action
    return None


__all__ = ["match_agent_intents", "match_document_chat_intent"]
