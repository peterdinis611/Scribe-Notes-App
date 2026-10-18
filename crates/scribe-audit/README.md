# scribe-audit

Append-only local audit log for the Scribe desktop app and `scribe-mcp`.

- Separate SQLite file: `scribe-audit.db` (next to `scribe.db`)
- Soft-fail appends from app / MCP (never block the caller)
- Admin password gate for viewing / clearing (salted iterated SHA-256)

## Features

| API | Purpose |
|-----|---------|
| `AuditStore::append` | Insert event + trim to retention |
| `list` / `list_query` | Filter by category, source, outcome, action, actor, resource, summary `q`, correlation, time range |
| `stats` | Totals + buckets by category / source / outcome / action / actor |
| `export_jsonl` | NDJSON export |
| `purge_before` | Age-based retention |
| `set_events_keep` | Cap retained rows (100–50_000, default 5_000) |
| `log_ok` / `log_denied` / `log_error` | Thin helpers |

## Types

- `AuditSource` — `tauri` \| `mcp` \| `system`
- `AuditCategory` — `agent` \| `handoff` \| `mcp_tool` \| `prefs` \| `security` \| `nlp` \| `admin` \| `canvas` \| `wiki` \| `library`
- `AuditOutcome` — `ok` \| `error` \| `denied`

Optional correlation fields on events: `correlation_id`, `session_id`, `app_version`.

## Schema

Current `SCHEMA_VERSION` is **3** (indexes on `actor` / resource / `correlation_id`; columns for correlation context).
