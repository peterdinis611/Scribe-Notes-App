# Scribe Memory MCP — documentation (EN)

Turn your local **Scribe** library into on-demand memory for **Claude Desktop** and **Cursor** using [MCP](https://modelcontextprotocol.io/).

The server prefers a **writable** SQLite connection (`create_note` / `append_to_note`). If the DB is locked (e.g. Scribe is running), it falls back to **read-only**.

## What you get

- Full-text **search** across notes  
- **Load** a document as plain text into the model context  
- Follow **`[[wiki links]]`**: backlinks, outgoing links, full connection graph  

This is **not** Claude’s product “Memory” feature. It is a **personal knowledge-base bridge** over MCP.

## Requirements

- macOS (Scribe desktop app)
- Rust toolchain (via `cargo`; installed with Xcode CLI tools or rustup)
- Scribe opened at least once (creates the DB)
- Cursor and/or Claude Desktop
- Optional: Python 3 + NLP deps for semantic tools (Local AI in Scribe settings)

Default database path:

```text
~/Library/Application Support/com.scribe.app/scribe.db
```

## Install

From the Scribe repo root:

```bash
npm run mcp:install
```

This builds `target/release/scribe-mcp`.

Smoke-run (process waits on stdio — expected; Ctrl+C to stop):

```bash
npm run mcp
```

## Connect Cursor

1. Open Cursor MCP settings (or `.cursor/mcp.json`).
2. Register the server with an **absolute** path to the binary:

```json
{
  "mcpServers": {
    "scribe-memory": {
      "command": "/Users/YOU/path/to/scribe/target/release/scribe-mcp",
      "args": []
    }
  }
}
```

See also [`../cursor.mcp.example.json`](../cursor.mcp.example.json).

3. Reload MCP / restart Cursor.
4. Try: *“Call scribe_status”* or *“Search my Scribe notes for …”*.

## Connect Claude Desktop

1. Edit or create:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

2. Add the same `mcpServers.scribe-memory` entry.
3. Fully quit Claude Desktop (Cmd+Q) and reopen.
4. Confirm MCP tools are listed, then ask Claude to search your notes.

## Write tools

- **`create_note`** — new note (`title`, optional `content`, `folderId`)
- **`append_to_note`** — append plain text to an existing note (`id`, `text`)

**Warning:** the running Scribe app may lock the database. If you see a lock/busy error or `writable: false` from `scribe_status`, retry shortly (or temporarily quit Scribe). Force readonly with `SCRIBE_MCP_WRITE=0`.

## Environment

| Variable | Meaning |
|----------|---------|
| `SCRIBE_DB_PATH` | Absolute path to `scribe.db` when not using the default |
| `SCRIBE_MCP_WRITE` | `0` = force read-only |
| `SCRIBE_NLP_SCRIPT` | Path to Python NLP `__main__.py` for semantic tools |
| `SCRIBE_NLP_PYTHON` | Python binary (default `python3`) |

```bash
SCRIBE_DB_PATH="/path/to/scribe.db" target/release/scribe-mcp
```

In MCP config:

```json
"env": {
  "SCRIBE_DB_PATH": "/path/to/scribe.db"
}
```

## Recommended usage workflow

1. **`search_documents`** — keyword recall  
2. or **`find_documents_by_title`** — known title / `[[Title]]`  
3. **`get_document`** — load plain text  
4. **`list_backlinks` / `list_outgoing_links` / `list_link_graph`** — walk the wiki map  

### Example prompts

- “Look in my Scribe library and summarize what I have about X.”
- “Find a document titled like ‘report’ and read it.”
- “Show the wiki link graph and which notes are orphans.”
- “What links to document id …?”

### Preparing notes in Scribe

- Write normally in the app  
- Link notes with `[[Document title]]`  
- Use the in-app **Connection map** (`/graph`) — same graph `list_link_graph` exposes

## Tools

Full argument reference: **[tools.md](tools.md)**.

| Tool | Purpose |
|------|---------|
| `scribe_status` | DB health |
| `search_documents` | Hybrid FTS + semantic (when Local AI enabled) |
| `search` | Unified search with `mode` and optional folder/tag/date filters |
| `list_open_tasks` | Open tasks across the library |
| `toggle_task` | Check/uncheck a task |
| `journal_summary` | AI journal recap |
| `summarize_document` | AI summary of one note |
| `get_or_create_journal` | Today's journal (day / morning / evening) |
| `list_nlp_artifacts` | Cached AI summaries/reports |
| `suggest_tags` | Tag suggestions |
| `library_report` | Library AI overview |
| `index_document` / `index_all_documents` | Embedding index |
| `nlp_status` | Local AI sidecar status |
| `trash_document` / `empty_trash` / `rename_document` / `replace_document_content` | Edit lifecycle |
| `restore_document_revision` | Restore a snapshot |
| `duplicate_document` / `export_document` | Copy / markdown export |
| `get_document_outline` | Heading TOC |
| `list_unresolved_wiki_links` / `list_graph_hubs` | Wiki insight |
| `delete_folder` / `move_folder` / `set_folder_pinned` | Folder write |
| `create_comment_thread` / `add_comment_reply` | Comments |
| `find_documents_by_title` | Title / wiki label |
| `get_document` | Full note text |
| `list_documents` | Recent notes |
| `list_folders` | Folders |
| `list_backlinks` | Incoming links |
| `list_outgoing_links` | Outgoing links |
| `list_link_graph` | Full map |
| `create_note` | Create a note (write) |
| `append_to_note` | Append text (write) |

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| DB not found | Launch Scribe once; check `SCRIBE_DB_PATH` |
| No tools in Claude | Restart app; validate JSON; use absolute paths |
| Empty search | Save documents in Scribe (FTS updates on write) |
| Wrong library | Call `scribe_status` and check `dbPath` |
| Build fails | Run `cargo build --release -p scribe-mcp` from repo root |
| Semantic tools empty | Enable Local AI in Scribe; wait for indexing |
| Process “hangs” in terminal | Normal for stdio — waiting for a client |
| Writes fail / `writable: false` | Scribe may hold a lock — retry; check `SCRIBE_MCP_WRITE` |

## Privacy

- Stays on your Mac  
- Local stdio process (this server does not upload by itself)  
- Writable when possible; otherwise `query_only`  
- Only content the model **fetches via tools** enters the chat (then subject to the host app’s cloud policy)

## Development

```text
crates/scribe-mcp/src/   # MCP server (rmcp stdio)
crates/scribe-core/src/  # shared DB, store, NLP bridge
```

```bash
cargo build --release -p scribe-mcp
cargo test -p scribe-mcp
```

## See also

- [Package README](../README.md)
- [Slovak guide](sk.md)
- [Tool reference](tools.md)
- In-app connection map: `/graph`
