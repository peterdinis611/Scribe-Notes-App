# Scribe MCP (Rust)

Pure Rust MCP server for Cursor and Claude Desktop.

## Build

```bash
# from repo root
npm run mcp:install   # cargo build --release -p scribe-mcp
npm run mcp           # run via cargo (dev)
```

Binary: `target/release/scribe-mcp`

## Cursor config

```json
{
  "mcpServers": {
    "scribe-memory": {
      "command": "/absolute/path/to/scribe/target/release/scribe-mcp",
      "args": []
    }
  }
}
```

Example: [`cursor.mcp.example.json`](cursor.mcp.example.json)

## Environment

| Variable | Meaning |
|----------|---------|
| `SCRIBE_DB_PATH` | Path to `scribe.db` (default: `~/Library/Application Support/com.scribe.app/scribe.db`) |
| `SCRIBE_MCP_WRITE` | Set to `0` to force read-only |
| `SCRIBE_NLP_SCRIPT` | Path to Python NLP `__main__.py` for semantic tools |
| `SCRIBE_NLP_PYTHON` | Python binary (default `python3`) |

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
| `get_document_outline` | Heading TOC |
| `list_graph_hubs` | Most connected notes by backlinks and outgoing wiki links |
| `library_answer` | Answer a question from the local library (hybrid + Local AI) |
| `document_answer` | Answer a question from one note (optional chat context) |
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
| `set_nlp_enabled` | Enable/disable Local AI (writable) |
| `set_embed_backend` | `hash` or `quality` embeddings (writable) |
| `calendar_events` | Date events from recent notes |
| `spellcheck` | Spellcheck a document |
| `extract_keywords` | Keywords / keyphrases |
| `analyze_sentiment` | Tone / sentiment |
| `list_templates` | Custom note templates |
| `create_note_from_template` | Create a note from a template (writable) |
| `list_backups` | List zip backups |
| `create_backup` | Create a library zip backup |
| `list_document_assets` | Images / SVG / Lottie under `assets/{id}/` |

Plus legacy tools: `scribe_status`, `get_document`, wiki links, folders, revisions, `create_note`, `append_to_note`, …

Resources: `scribe://doc/{id}`, `scribe://artifact/{id}`. Prompts: `weekly_journal_review`, `capture_today`, `open_tasks_triage`, `wiki_health`.

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
