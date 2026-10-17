# scribe-audit

Append-only local audit log for the Scribe desktop app and `scribe-mcp`.

- Separate SQLite file: `scribe-audit.db` (next to `scribe.db`)
- Soft-fail appends from app / MCP (never block the caller)
- Admin password gate for viewing / clearing (salted iterated SHA-256)

## Features

| API | Purpose |
|-----|---------|
| `AuditStore::append` | Insert event + trim to retention |
| `list` / `list_query` | Filter by category, source, outcome, action, time range |
| `stats` | Totals + buckets by category / source / outcome |
| `export_jsonl` | NDJSON export |
| `purge_before` | Age-based retention |
| `set_events_keep` | Cap retained rows (100–50_000, default 5_000) |
| `log_ok` / `log_denied` / `log_error` | Thin helpers |

## Schema

Current `SCHEMA_VERSION` is **2** (indexes on `outcome` and `action`).
