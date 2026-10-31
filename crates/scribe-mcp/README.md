# Scribe MCP (Rust)

Pure Rust MCP server for Cursor and Claude Desktop.

## Build

```bash
# from repo root
npm run mcp:install   # cargo build --release -p scribe-mcp
npm run mcp           # run via cargo (dev)
```

Binary: `target/release/scribe-mcp`

## Cursor config (stdio — local)

```json
{
  "mcpServers": {
    "scribe-memory": {
      "command": "/absolute/path/to/scribe/target/release/scribe-mcp",
      "args": [],
      "env": {
        "SCRIBE_MCP_WRITE": "0",
        "SCRIBE_MCP_SCOPE": "no-vault"
      }
    }
  }
}
```

Example: [`cursor.mcp.example.json`](cursor.mcp.example.json)

**Shared / team Cursor configs:** never set `SCRIBE_MCP_WRITE=1` or `SCRIBE_MCP_SCOPE=full`. Those belong only in a private local override when you explicitly need write/vault access, then turn them off again.

## HTTP / online endpoints (Streamable HTTP)

stdio stays the default. For remote Cursor / agents / tunnels, run Streamable HTTP:

```bash
# loopback only (no token required, but recommended)
SCRIBE_MCP_HTTP_TOKEN='change-me' npm run mcp:http

# or expose on LAN / VPS (token REQUIRED)
SCRIBE_MCP_HTTP=1 \
SCRIBE_MCP_HTTP_BIND=0.0.0.0:8788 \
SCRIBE_MCP_HTTP_TOKEN="$(openssl rand -hex 24)" \
npm run mcp:http
```

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness (`ok`) |
| `POST/GET /mcp` | MCP Streamable HTTP (Bearer token when configured) |

Cursor-style remote server (when your client supports URL MCP):

```json
{
  "mcpServers": {
    "scribe-memory-http": {
      "url": "http://127.0.0.1:8788/mcp",
      "headers": {
        "Authorization": "Bearer change-me"
      }
    }
  }
}
```

For true “online” access, keep the process on loopback and put **Cloudflare Tunnel / Tailscale / ngrok** in front — do not publish an unauthenticated `0.0.0.0` bind.

CLI flags: `--http`, `--bind 127.0.0.1:8788` (same as env).

## Environment

| Variable | Meaning |
|----------|---------|
| `SCRIBE_DB_PATH` | Path to `scribe.db` (default: `~/Library/Application Support/com.scribe.app/scribe.db`) |
| `SCRIBE_MCP_WRITE` | Default read-only. Set to `1` to allow write tools (**local only — not in shared configs**) |
| `SCRIBE_MCP_SCOPE` | Vault access: `no-vault` (default), `meta-only`, or `full` (**never `full` in shared configs**) |
| `SCRIBE_MCP_HTTP` | `1` → Streamable HTTP instead of stdio |
| `SCRIBE_MCP_HTTP_BIND` | Bind address (default `127.0.0.1:8788`) |
| `SCRIBE_MCP_HTTP_TOKEN` | Bearer token for `/mcp` (required when bind is not loopback) |
| `SCRIBE_NLP_SCRIPT` | Path to Python NLP `__main__.py` for semantic tools |
| `SCRIBE_NLP_PYTHON` | Python binary (default `python3`) |

### Vault scope (`SCRIBE_MCP_SCOPE`)

Encrypted vault notes are stored as AES-GCM ciphertext in SQLite. The unlock password never leaves the Scribe UI.

| Value | Behavior |
|-------|----------|
| `no-vault` (default) | Vault notes excluded from search hits, `get_document`, export, outline, and NLP tools |
| `meta-only` | Vault notes may appear as id/title/folder only — body and ciphertext stay hidden |
| `full` | Allow raw ciphertext JSON (not recommended for agents) |

`scribe_status` reports the active `vaultScope`. Local AI never indexes vault ciphertext; the app can optionally analyze an **unlocked** vault note in memory via the AI insights panel.

## Tools

| Tool | Description |
|------|-------------|
| `search_documents` | Hybrid FTS + semantic search when Local AI is enabled |
| `search_documents_fts` | Full-text search only |
| `search` | Unified search with `mode` + optional `folderId`/`tag`/`fromDate`/`toDate` |
| `semantic_search` | Embedding-based search |
| `similar_documents` | Semantically similar notes |
| `extract_document_tasks` | Checkboxes + NLP phrase tasks |
| `list_open_tasks` | Open tasks across the whole library |
| `list_tasks_agenda` | Open tasks grouped overdue / today / upcoming / later |
| `toggle_task` | Check or uncheck a task by text |
| `journal_tasks` | Tasks from multiple journal documents |
| `journal_summary` | AI summary of journal date range |
| `summarize_document` | AI summary of one note |
| `get_or_create_journal` | Open today's journal (day / morning / evening) |
| `list_nlp_artifacts` | Cached journal summaries and library reports |
| `suggest_tags` | Tag and entity suggestions for a note |
| `library_report` | AI overview of entire library |
| `index_document` / `index_all_documents` | (Re)build embedding index |
| `nlp_status` | Sidecar health, model, index counts |
| `trash_document` / `restore_document` / `purge_document` / `empty_trash` | Trash lifecycle |
| `restore_document_revision` | Restore a note to a snapshot |
| `duplicate_document` / `rename_document` / `replace_document_content` | Edit notes |
| `export_document` | Markdown or plain text |
| `export_document_source` | First code block + language extension |
| `get_document_outline` | Heading TOC |
| `list_graph_hubs` | Most connected notes by backlinks and outgoing wiki links |
| `wiki_neighborhood` | Outbound wiki-link neighbors (BFS hops) |
| `find_wiki_ghost_match` | Plain-text title/alias that can become `[[wiki]]` |
| `parse_document_aliases` / `add_document_alias` | Read / write `alias:*` tags (add is writable) |
| `library_answer` | Answer a question from the local library (hybrid + Local AI) |
| `document_answer` | Answer a question from one note (optional chat context) |
| `document_answer_and_save` | Answer + persist user/assistant turns |
| `document_analysis` | Keywords, outline, summary, tone, dates, mentions |
| `suggest_title` | Suggest a title/slug for a note |
| `find_duplicates` | Near-duplicate notes |
| `suggest_wiki_links` | Suggested `[[wiki links]]` for a note |
| `suggest_organize` | Folder / organize hints for a note |
| `summarize_diff` | Diff bullets between two plain texts |
| `summarize_revision_diff` | Diff bullets: revision → current note |
| `template_fill_hints` | Missing / filled template sections |
| `reading_stats` | Reading time / readability |
| `detect_language` | Detect note language |
| `rewrite_query` | Expand a search query |
| `rewrite_selection` | Rewrite unsaved text (Local AI) |
| `analyze_plaintext` | Analyze unsaved text (Local AI) |
| `get_nlp_artifact` | Load one cached AI artifact |
| `list_libraries` / `switch_library` / `create_library` | Libraries + active scope (switch/create are writable) |
| `extract_entities` / `extract_mentions` / `extract_dates` | Entities, mentions, dates from `id` or `text` |
| `list_manuscripts` / `upsert_manuscript` / `compile_manuscript` | Chapter sets + markdown join |
| `list_smart_folders` / `upsert_smart_folder` / `evaluate_smart_folder` | Saved filters |
| `list_sync_conflicts` / `resolve_sync_conflict` | Disk/app conflicts |
| `chunk_text` / `extract_outline` | Sidecar chunks + NLP outline |
| `extract_asset_ocr` | OCR a note image asset |
| `library_find_replace` | Scoped find/replace (dry-run default) |
| `list_document_chat` / `append_document_chat` / `clear_document_chat` | Persisted note chat |
| `set_nlp_enabled` | Enable/disable Local AI (writable) |
| `set_embed_backend` | `hash` or `quality` embeddings (writable) |
| `calendar_events` | Date events from recent notes |
| `run_agent` | Local agent (planner or `recipeId`/`forceTools`; role personas; write-gated ingest/canvas/template; `persona=spellcheck` for Spellcheck Agent) |
| `run_spellcheck_agent` | Spellcheck Agent on one note (grammar teachings) |
| `spellcheck` | Spellcheck a document |
| `extract_keywords` | Keywords / keyphrases |
| `analyze_sentiment` | Tone / sentiment |
| `extract_flashcards` | Study flashcards (Q&A / cloze) from id or text |
| `extract_takeaways` | Key takeaways / executive bullets |
| `check_terminology` | Inconsistent terminology / casing |
| `writing_coach` | Style / clarity hints |
| `analyze_revision_diff` | Revision AI on two plain texts (changeKind, risks) |
| `analyze_revision_diff_for_document` | Revision AI: snapshot → current note |
| `suggest_continuation` | Continue-writing suggestions from library corpus |
| `wiki_health_report` | Unresolved links + stubs summary |
| `list_stub_documents` | Short stub notes |
| `list_orphan_documents` | Notes with no wiki links |
| `suggest_wiki_resolutions` | Unresolved links + fuzzy title scores |
| `resolve_wiki_link` | Set `targetId` on `[[label]]` (writable) |
| `create_and_link_wiki_note` | Create missing target + link (writable) |
| `auto_resolve_wiki_links` | Auto-link when suggestion ≥ minScore (writable) |
| `expand_stub_document` | Append outline scaffold to a stub (writable) |
| `filter_library_smart` | Sidebar smart filters (stubs/tasks/media/…) |
| `list_library_videos` / `get_library_video` / `delete_library_video` | Local large-video library |
| `parse_template_pack` | Validate `.scribe-templates.json` (no import) |
| `audit_status` / `list_audit_events` / `get_audit_event` / `get_audit_stats` / `export_audit_events_jsonl` | Local audit log (`scribe-audit.db`) |
| `list_templates` | Custom note templates |
| `create_note_from_template` | Create a note from a template (writable) |
| `list_backups` | List zip backups |
| `create_backup` | Create a library zip backup |
| `list_document_assets` | Images / SVG / Lottie under `assets/{id}/` |
| `get_ui_manifest` | UI catalogs from `scribe-ui` (Whats New, settings/docs, themes, agents) |
| `fuzzy_rank_strings` | Fuzzy rank `{id, primary, secondary?}` lists |
| `list_theme_presets` / `generate_random_theme` | Theme preset catalog / random colors |
| `render_ui_surface` | Chrome HTML via `python-ui` (whats-new, welcome, …; needs Local AI) |
| `plan_agent_goal` / `agent_document_brief` | Planner-only (no tool execution) |
| `section_summaries` / `extract_decisions` / `extract_quotes` / `extract_commitments` / `detect_pii` / `rank_tasks` / `open_loops` / `reading_plan` / `note_pulse` / `tone_pack` / `contradiction_hints` / `forward_plan` | Study/review pack (Python + Rust fallback; contradictions need Local AI) |
| `passage_rerank` / `answer_followups` | Retrieval helpers after search / Q&A |
| `files_index_status` / `files_similar` / `files_index_clear` | Files sandbox index ops (Local Files API) |

Plus legacy tools: `scribe_status`, `get_document`, wiki links, folders, revisions, `create_note`, `append_to_note`, …

Resources: `scribe://doc/{id}`, `scribe://artifact/{id}`. Prompts: `weekly_journal_review`, `capture_today`, `open_tasks_triage`, `wiki_health`, `rewrite_selection_draft`, `continue_document_chat`, `analyze_this_note`, `study_flashcards`, `writing_coach_pass`, `spellcheck_agent_pass`, `revision_review`, `continue_writing`, `switch_and_search`, `audit_security_review`.

Full reference: [docs/tools.md](docs/tools.md) · guides: [docs/en.md](docs/en.md), [docs/sk.md](docs/sk.md)

## Architecture

```
Cursor / Claude  →  scribe-mcp (Rust, rmcp stdio)
                         ↓
                    scribe-core (store + db)
                         ↓
                    scribe.db  +  optional Python NLP sidecar
```

Shared logic lives in `crates/scribe-core` (also used by the Tauri app).

### Source layout

| Path | Role |
|------|------|
| `src/main.rs` | stdio entry |
| `src/server/mod.rs` | `ScribeMcp` + merged `tool_router` / `prompt_router` |
| `src/server/tools_*.rs` | Domain tool routers (documents, journal, agent, library, study/files, wiki, UI) |
| `src/server/agent_exec.rs` | Local-agent tool dispatch |
| `src/server/prompts.rs` / `resources.rs` | MCP prompts + `scribe://` resources |
| `src/tools/*.rs` | Tool parameter structs |
