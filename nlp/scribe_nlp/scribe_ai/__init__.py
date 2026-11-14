"""Pure AI helpers — parity surface with Rust crate ``scribe-ai``.

No embeddings, no HTTP, no SQLite. Hosts (sidecar RPC / tests) own I/O.
"""

from __future__ import annotations

from ..commitments import extract_commitments
from ..tone import tone_pack
from .chat_intent import match_agent_intents, match_document_chat_intent
from .citation_pack import citation_pack
from .decisions import extract_decisions
from .normalize import collapse_ws, fold_diacritics, fold_text, stem_lite
from .note_pulse import note_pulse
from .open_loops import open_loops
from .pii import detect_pii
from .prompts import PromptKind, system_prompt, user_prompt
from .query_rewrite import rewrite_query
from .quotes import extract_quotes
from .revision_ai import analyze_revision_diff
from .section_summaries import section_summaries
from .task_rank import rank_tasks
from .title import suggest_title
from .tool_plan import plan_tools_from_question

__all__ = [
    "PromptKind",
    "analyze_revision_diff",
    "citation_pack",
    "collapse_ws",
    "detect_pii",
    "extract_commitments",
    "extract_decisions",
    "extract_quotes",
    "fold_diacritics",
    "fold_text",
    "match_agent_intents",
    "match_document_chat_intent",
    "note_pulse",
    "open_loops",
    "plan_tools_from_question",
    "rank_tasks",
    "rewrite_query",
    "section_summaries",
    "stem_lite",
    "suggest_title",
    "system_prompt",
    "tone_pack",
    "user_prompt",
]
