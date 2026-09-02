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
| `search` | Unified search with `mode`: hybrid, semantic, fts |
| `semantic_search` | Embedding-based search |
| `similar_documents` | Semantically similar notes |
| `extract_document_tasks` | Checkboxes + NLP phrase tasks |
| `journal_tasks` | Tasks from multiple journal documents |
| `journal_summary` | AI summary of journal date range |
| `suggest_tags` | Tag and entity suggestions for a note |
| `library_report` | AI overview of entire library |
| `index_document` / `index_all_documents` | (Re)build embedding index |
| `nlp_status` | Sidecar health, model, index counts |
| `trash_document` / `restore_document` / `purge_document` | Trash lifecycle |
| `rename_document` / `replace_document_content` | Edit notes |
| `set_document_favorite` / `set_document_pinned` | Flags |

Plus legacy tools: `scribe_status`, `get_document`, wiki links, folders, revisions, `create_note`, `append_to_note`, …

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
