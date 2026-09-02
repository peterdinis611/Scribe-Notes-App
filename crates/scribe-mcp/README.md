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
| `list_unresolved_wiki_links` / `list_graph_hubs` | Wiki graph insight |
| `delete_folder` / `move_folder` / `set_folder_pinned` | Folder write |
| `create_comment_thread` / `add_comment_reply` | Comments |

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
