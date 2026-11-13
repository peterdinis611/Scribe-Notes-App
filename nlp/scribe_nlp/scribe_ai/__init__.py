"""Pure AI helpers — parity surface with Rust crate ``scribe-ai``.

No embeddings, no HTTP, no SQLite. Hosts (sidecar RPC / tests) own I/O.
"""

from __future__ import annotations

from .chat_intent import match_agent_intents, match_document_chat_intent
from .citation_pack import citation_pack
from .normalize import collapse_ws, fold_diacritics, fold_text, stem_lite
from .prompts import PromptKind, system_prompt, user_prompt
from .query_rewrite import rewrite_query
from .revision_ai import analyze_revision_diff
from .tool_plan import plan_tools_from_question
from ..commitments import extract_commitments
from ..tone import tone_pack

__all__ = [
    "PromptKind",
    "analyze_revision_diff",
    "citation_pack",
    "collapse_ws",
    "extract_commitments",
    "fold_diacritics",
    "fold_text",
    "match_agent_intents",
    "match_document_chat_intent",
    "plan_tools_from_question",
    "rewrite_query",
    "stem_lite",
    "system_prompt",
    "tone_pack",
    "user_prompt",
]
