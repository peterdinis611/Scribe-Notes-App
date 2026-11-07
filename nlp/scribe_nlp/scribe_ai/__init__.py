"""Pure AI helpers — parity surface with Rust crate ``scribe-ai``.

No embeddings, no HTTP, no SQLite. Hosts (sidecar RPC / tests) own I/O.
"""

from __future__ import annotations

from ..citation_pack import citation_pack
from ..commitments import extract_commitments
from ..query_rewrite import rewrite_query
from ..revision_ai import analyze_revision_diff
from ..tone import tone_pack
from .prompts import PromptKind, system_prompt, user_prompt
from .tool_plan import plan_tools_from_question

__all__ = [
    "PromptKind",
    "analyze_revision_diff",
    "citation_pack",
    "extract_commitments",
    "plan_tools_from_question",
    "rewrite_query",
    "system_prompt",
    "tone_pack",
    "user_prompt",
]
