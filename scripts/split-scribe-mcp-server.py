#!/usr/bin/env python3
"""Split crates/scribe-mcp/src/server.rs into server/ modules with merged routers."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "crates/scribe-mcp/src/server.rs"
OUT = ROOT / "crates/scribe-mcp/src/server"

COMMON_IMPORTS = """\
use crate::server::ScribeMcp;
use crate::tools;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::{tool, tool_router};
"""

PROMPT_IMPORTS = """\
use crate::server::ScribeMcp;
use crate::tools;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{GetPromptResult, PromptMessage, Role};
use rmcp::{prompt, prompt_router};
"""

# Inclusive start / exclusive end (1-based), at #[tool(...)] attributes.
TOOL_CHUNKS = [
    ("tools_documents.rs", "router_documents", 751, 1363),
    ("tools_journal.rs", "router_journal", 1363, 1733),
    ("tools_agent.rs", "router_agent", 1733, 2169),
    ("tools_library.rs", "router_library", 2169, 2647),
    ("tools_study_files.rs", "router_study_files", 2647, 2947),
    ("tools_wiki.rs", "router_wiki", 2947, 3279),
    ("tools_ui.rs", "router_ui", 3279, 3738),
]


def slice_lines(lines: list[str], start: int, end: int) -> str:
    return "\n".join(lines[start - 1 : end - 1]).rstrip() + "\n"


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"missing {SRC} (already split?)")

    lines = SRC.read_text().splitlines()
    OUT.mkdir(parents=True, exist_ok=True)

    # Helper impl: struct + methods through grammar_rules (before execute_agent_tool doc).
    # Line 119 is `    /// Map planner...` / Line 120 is `fn execute_agent_tool`.
    # Keep lines 22-118 (struct through grammar_rules closing), then close impl.
    helper_head = slice_lines(lines, 22, 119).rstrip() + "\n}\n"

    # Agent dispatch: execute_agent_tool + run_agent_with_persona (119-747 inclusive body inside impl)
    # Lines 119-747 are methods; 748 blank; 749 #[tool_router]
    agent_methods = slice_lines(lines, 119, 748)

    agent_exec_rs = f"""//! Local-agent tool dispatch (parity with in-app Local Agent).

use crate::server::ScribeMcp;
use crate::tools;

use scribe_core::store::ScribeStore;

impl ScribeMcp {{
{agent_methods}}}
"""

    mod_rs = f"""//! Scribe MCP server: struct, helpers, merged tool/prompt routers, resources.

mod agent_exec;
mod prompts;
mod resources;
mod tools_agent;
mod tools_documents;
mod tools_journal;
mod tools_library;
mod tools_study_files;
mod tools_ui;
mod tools_wiki;

use std::future::ready;
use std::path::PathBuf;
use std::sync::Mutex;

use rmcp::handler::server::router::prompt::PromptRouter;
use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::model::{{
    ErrorData, ListResourceTemplatesResult, ListResourcesResult, ReadResourceRequestParams,
    ReadResourceResponse, ReadResourceResult, Resource, ResourceContents, ResourceTemplate,
    ServerCapabilities, ServerConfig,
}};
use rmcp::service::RequestContext;
use rmcp::{{prompt_handler, tool_handler, RoleServer, ServerHandler}};
use scribe_core::nlp::{{resolve_script_path, NlpSidecar}};
use scribe_core::store::{{open_scribe_store, ScribeStore}};
use scribe_core::vault::McpVaultScope;

{helper_head}

impl ScribeMcp {{
    /// Combined tool router for `#[tool_handler]`.
    pub fn tool_router() -> ToolRouter<Self> {{
        Self::router_documents()
            + Self::router_journal()
            + Self::router_agent()
            + Self::router_library()
            + Self::router_study_files()
            + Self::router_wiki()
            + Self::router_ui()
    }}

    /// Combined prompt router for `#[prompt_handler]`.
    pub fn prompt_router() -> PromptRouter<Self> {{
        Self::prompt_router_main()
    }}
}}

#[tool_handler]
#[prompt_handler]
impl ServerHandler for ScribeMcp {{
{slice_lines(lines, 3981, 4075).rstrip()}
}}
"""

    (OUT / "mod.rs").write_text(mod_rs)
    (OUT / "agent_exec.rs").write_text(agent_exec_rs)

    for filename, router_name, start, end in TOOL_CHUNKS:
        body = slice_lines(lines, start, end)
        (OUT / filename).write_text(
            f"""{COMMON_IMPORTS}

#[tool_router(router = {router_name}, vis = "pub(crate)")]
impl ScribeMcp {{
{body}}}
"""
        )

    # Prompt methods: 3742..=3976 (exclude closing brace of prompt impl at 3977)
    prompts_rs = f"""{PROMPT_IMPORTS}

#[prompt_router(router = "prompt_router_main", vis = "pub(crate)")]
impl ScribeMcp {{
{slice_lines(lines, 3742, 3977)}}}
"""
    (OUT / "prompts.rs").write_text(prompts_rs)

    resources_rs = f"""//! MCP resources (`scribe://doc|artifact|revision/...`).

use crate::server::ScribeMcp;

use rmcp::model::{{ErrorData, Resource, ResourceContents}};

impl ScribeMcp {{
{slice_lines(lines, 4077, 4152).rstrip()}
}}
"""
    (OUT / "resources.rs").write_text(resources_rs)

    # Remove monolithic file so `mod server` resolves to server/
    SRC.unlink()

    print("Wrote server/ modules:")
    for path in sorted(OUT.glob("*.rs")):
        n = sum(1 for _ in path.open())
        print(f"  {path.name:24} {n:5} lines")


if __name__ == "__main__":
    main()
