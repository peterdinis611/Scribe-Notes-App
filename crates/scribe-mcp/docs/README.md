# Scribe MCP documentation

Documentation for the **Scribe Memory** MCP server — local notes as memory for Claude / Cursor.

| Document | Language | Contents |
|----------|----------|----------|
| [sk.md](sk.md) | Slovenčina | Kompletný návod (inštalácia, Cursor, Claude, workflow, riešenie problémov) |
| [en.md](en.md) | English | Full guide (setup, Cursor, Claude Desktop, workflow, troubleshooting) |
| [tools.md](tools.md) | EN | Tool reference (arguments, returns, examples) |

Package overview: [../README.md](../README.md)

## What this is

Scribe stores documents in a local SQLite database. The MCP server opens that database (writable when possible) and exposes tools so an AI client can:

- search notes (FTS5 + optional semantic hybrid)
- load a document as plain text
- follow `[[wiki links]]` (backlinks, outgoing, full graph)
- optionally **create** or **append** notes (`create_note`, `append_to_note`)

It does **not** replace Claude’s built-in Memory product. It gives Claude / Cursor **on-demand access** to your Scribe library — closer to a personal knowledge base than a chat-memory store.

## Architecture (short)

```
Claude Desktop / Cursor
        │  MCP (stdio)
        ▼
  scribe-mcp (Rust)
        │  rusqlite (writable → readonly fallback)
        ▼
  ~/Library/Application Support/com.scribe.app/scribe.db
        │  optional
        ▼
  Python NLP sidecar (semantic search)
```

Source: `crates/scribe-mcp/src/` (server) + `crates/scribe-core/` (DB, store, NLP bridge).
