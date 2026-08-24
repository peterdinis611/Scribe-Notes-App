# Scribe Memory MCP — documentation (EN)

Turn your local **Scribe** library into on-demand memory for **Claude Desktop** and **Cursor** using [MCP](https://modelcontextprotocol.io/).

The server opens Scribe’s SQLite database **read-only**. It never writes notes — Scribe remains the source of truth.

## What you get

- Full-text **search** across notes  
- **Load** a document as plain text into the model context  
- Follow **`[[wiki links]]`**: backlinks, outgoing links, full connection graph  

This is **not** Claude’s product “Memory” feature. It is a **personal knowledge-base bridge** over MCP.

## Requirements

- macOS (Scribe desktop app)
- Node.js **20+**
- Scribe opened at least once (creates the DB)
- Cursor and/or Claude Desktop

Default database path:

```text
~/Library/Application Support/com.scribe.app/scribe.db
```

## Install

From the Scribe repo root:

```bash
npm run mcp:install
```

Or:

```bash
cd mcp
npm install
```

Smoke-run (process waits on stdio — expected; Ctrl+C to stop):

```bash
npm run mcp
# or: cd mcp && npm start
```

You should see on stderr: `Scribe memory MCP ready`.

## Connect Cursor

1. Open Cursor MCP settings (or `.cursor/mcp.json`).
2. Register the server with an **absolute** path to `mcp/`:

```json
{
  "mcpServers": {
    "scribe-memory": {
      "command": "npm",
      "args": ["run", "start", "--prefix", "/Users/YOU/path/to/scribe/mcp"]
    }
  }
}
```

See also [`../cursor.mcp.example.json`](../cursor.mcp.example.json).

3. Reload MCP / restart Cursor.
4. Try: *“Call scribe_status”* or *“Search my Scribe notes for …”*.

### After build

```bash
cd mcp && npm run build
```

```json
{
  "mcpServers": {
    "scribe-memory": {
      "command": "node",
      "args": ["/Users/YOU/path/to/scribe/mcp/dist/index.js"]
    }
  }
}
```

## Connect Claude Desktop

1. Edit or create:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

2. Add the same `mcpServers.scribe-memory` entry.
3. Fully quit Claude Desktop (Cmd+Q) and reopen.
4. Confirm MCP tools are listed, then ask Claude to search your notes.

## Environment

| Variable | Meaning |
|----------|---------|
| `SCRIBE_DB_PATH` | Absolute path to `scribe.db` when not using the default |

```bash
SCRIBE_DB_PATH="/path/to/scribe.db" npm start
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
| `search_documents` | Full-text search |
| `find_documents_by_title` | Title / wiki label |
| `get_document` | Full note text |
| `list_documents` | Recent notes |
| `list_folders` | Folders |
| `list_backlinks` | Incoming links |
| `list_outgoing_links` | Outgoing links |
| `list_link_graph` | Full map |

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| DB not found | Launch Scribe once; check `SCRIBE_DB_PATH` |
| No tools in Claude | Restart app; validate JSON; use absolute paths |
| Empty search | Save documents in Scribe (FTS updates on write) |
| Wrong library | Call `scribe_status` and check `dbPath` |
| `better-sqlite3` errors | Node 20+; reinstall in `mcp/` |
| Process “hangs” in terminal | Normal for stdio — waiting for a client |

## Privacy

- Stays on your Mac  
- Local stdio process (this server does not upload by itself)  
- SQLite `query_only`  
- Only content the model **fetches via tools** enters the chat (then subject to the host app’s cloud policy)

## Development

```text
mcp/src/index.ts      # MCP tool registration
mcp/src/db.ts         # SQL against Scribe DB
mcp/src/plain-text.ts # TipTap JSON → plain text
```

```bash
cd mcp
npm run typecheck
npm run build
```

## See also

- [Package README](../README.md)
- [Slovak guide](sk.md)
- [Tool reference](tools.md)
- In-app connection map: `/graph`
