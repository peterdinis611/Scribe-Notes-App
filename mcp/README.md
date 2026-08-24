# Scribe Memory MCP

Use your local **Scribe** notes as memory for **Claude Desktop** and **Cursor** via the [Model Context Protocol](https://modelcontextprotocol.io/).

The server reads the Scribe SQLite database **read-only** (safe while the app is open). Claude does not write to your library — it only searches and loads notes on demand.

| | |
|--|--|
| **Package** | `mcp/` in this repo |
| **Default DB** | `~/Library/Application Support/com.scribe.app/scribe.db` |
| **Docs** | [Documentation index](docs/README.md) · [Slovak](docs/sk.md) · [English](docs/en.md) · [Tool reference](docs/tools.md) |

---

## Quick start

```bash
# from the Scribe repo root
npm run mcp:install
npm run mcp
```

Or:

```bash
cd mcp
npm install
npm start
```

The process speaks MCP over **stdio** (stdin/stdout). Do not `console.log` into stdout when embedding it — logging goes to stderr.

---

## Connect Cursor

1. Install deps: `npm run mcp:install`
2. Open **Cursor Settings → MCP** (or project `.cursor/mcp.json`)
3. Add a server (use your **absolute** path):

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

Example file in the repo: [`cursor.mcp.example.json`](cursor.mcp.example.json).

4. Reload MCP / restart Cursor
5. Ask something like: *“Search my Scribe notes for report”* — Cursor should call `search_documents`

**Built binary alternative** (after `cd mcp && npm run build`):

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

---

## Connect Claude Desktop

1. Edit:

`~/Library/Application Support/Claude/claude_desktop_config.json`

2. Add the same `mcpServers.scribe-memory` block as above (absolute `--prefix` path).
3. Fully quit and reopen Claude Desktop.
4. In a chat, confirm tools under the MCP / hammer UI, then ask Claude to search your notes.

---

## Environment

| Variable | Meaning |
|----------|---------|
| `SCRIBE_DB_PATH` | Absolute path to `scribe.db` if not using the default |

```bash
SCRIBE_DB_PATH="/path/to/scribe.db" npm start
```

---

## Tools (overview)

| Tool | Use when… |
|------|-----------|
| `scribe_status` | Check that the DB is reachable |
| `search_documents` | Recall by keyword / phrase |
| `find_documents_by_title` | You know a note title or `[[wiki]]` label |
| `get_document` | Need full note text as context |
| `list_documents` | Browse recent notes |
| `list_folders` | See folder structure |
| `list_backlinks` | What links **to** this note |
| `list_outgoing_links` | What this note links **to** |
| `list_link_graph` | Whole connection map |

Full schemas and examples: **[docs/tools.md](docs/tools.md)**.

---

## Recommended workflow for the model

1. `search_documents` or `find_documents_by_title`
2. `get_document` on the best hit(s)
3. Optionally `list_backlinks` / `list_outgoing_links` / `list_link_graph` to follow wiki connections

Scribe remains the source of truth. Keep writing and linking with `[[Title]]` in the app; Claude only reads.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run MCP over stdio (`tsx`) |
| `npm run build` | Compile to `dist/` |
| `npm run typecheck` | TypeScript check |
| `npm run mcp` (repo root) | Same as `mcp` `npm start` |
| `npm run mcp:install` (repo root) | Install `mcp/` dependencies |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| “database not found” | Open Scribe once so the DB is created, or set `SCRIBE_DB_PATH` |
| Tools missing in Claude | Restart Claude Desktop; check JSON commas/paths |
| Empty search | Write/save notes in Scribe; FTS indexes on save |
| Wrong library | Confirm path via `scribe_status` |
| `better-sqlite3` build errors | Use Node 20+; re-run `npm install` in `mcp/` |

More detail: [docs/en.md](docs/en.md) · [docs/sk.md](docs/sk.md).

---

## Privacy

- Local only — no cloud upload from this server
- Read-only SQL (`query_only`)
- No API keys required for the MCP process itself
