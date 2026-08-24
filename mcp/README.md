# Scribe Memory MCP

Exposes your local Scribe library (documents, FTS search, wiki-link graph) to **Claude Desktop** and **Cursor** as an MCP memory system.

The server opens Scribe’s SQLite database **read-only** — safe while the app is running.

Default DB path (macOS):

`~/Library/Application Support/com.scribe.app/scribe.db`

Override with `SCRIBE_DB_PATH`.

## Tools

| Tool | Purpose |
|------|---------|
| `search_documents` | Full-text search notes |
| `find_documents_by_title` | Match by title / wiki-link label |
| `get_document` | Load note as plain text |
| `list_documents` | Recent documents |
| `list_folders` | Folder list |
| `list_backlinks` | Incoming `[[wiki]]` links |
| `list_outgoing_links` | Outgoing `[[wiki]]` links |
| `list_link_graph` | Full connection map |
| `scribe_status` | DB health check |

## Setup

```bash
cd mcp
npm install
```

Run (stdio):

```bash
npm start
# or from repo root:
npm run mcp
```

## Cursor

Add to Cursor MCP settings (`.cursor/mcp.json` in the project or global MCP config):

```json
{
  "mcpServers": {
    "scribe-memory": {
      "command": "npm",
      "args": ["run", "start", "--prefix", "/ABSOLUTE/PATH/TO/scribe/mcp"],
      "env": {}
    }
  }
}
```

Or after `npm run build` in `mcp/`:

```json
{
  "mcpServers": {
    "scribe-memory": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/scribe/mcp/dist/index.js"]
    }
  }
}
```

## Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "scribe-memory": {
      "command": "npm",
      "args": ["run", "start", "--prefix", "/ABSOLUTE/PATH/TO/scribe/mcp"]
    }
  }
}
```

Restart Claude Desktop after saving.

## How Claude should use it

1. `search_documents` or `find_documents_by_title` to locate notes  
2. `get_document` for full plain-text context  
3. `list_backlinks` / `list_outgoing_links` / `list_link_graph` to follow the wiki map  

Your Scribe notes stay the source of truth; Claude only reads them on demand.
