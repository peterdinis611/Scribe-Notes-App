# scribe-logging

Terminal logging + in-memory ring + env level resolution for Scribe.

## Env

| Variable | Effect |
|----------|--------|
| `SCRIBE_RUST_LOG` | Preferred level (`debug`, `trace`, `info`, `warn`, `error`, `1`/`true`) |
| `RUST_LOG` | Fallback |
| `SCRIBE_DEBUG` | Fallback (`1` / `true` → debug) |
| `SCRIBE_NLP_DEBUG` | Hint flag for NLP sidecar verbosity |
| `SCRIBE_LOG_FILE` | Append logs to this file path |
| `SCRIBE_LOG_RING` | Ring capacity (32–10000, default 500) |
| `SCRIBE_LOG_COLORS` | `0`/`1` colored terminal levels |
| `SCRIBE_LOG_STDERR` | `0` → stdout instead of stderr |
| `SCRIBE_LOG_TIMESTAMPS` | `0` to disable timestamps |
| `SCRIBE_LOG_MIRROR_FE` | `0` to ignore FE `logging_write` |

## Usage (Tauri)

```rust
scribe_logging::init_from_env()?;
log::info!(target: "scribe.logging", "ready");
scribe_logging::set_runtime_level("debug");
let lines = scribe_logging::recent_logs(50, Some("warn"), Some("scribe."));
```

Logs go to **stderr** by default (colored, timestamps) in the cargo / `tauri dev` terminal,
optionally to a file, and always into the in-memory ring for Diagnostics.

Quiet filters: `tao`, `wry`, `hyper`, `reqwest`, `tracing` → warn.

### Frontend → terminal

Commands: `logging_status`, `logging_write`, `logging_ping`, `logging_recent`,
`logging_clear`, `logging_stats`, `logging_set_level`, `logging_scopes`.

FE: `@/lib/logging` → `mirrorLogToTerminal` / `loggingRecent` (also used by `scribeLog`).

## API

- `resolve_level_from_env` / `parse_level_filter` / `set_runtime_level`
- `LoggingSettings` + `ModuleLevel` + normalize / from_json / from_env
- `init_from_env` / `init_terminal_logger` (feature `terminal`)
- `log_frontend_line` / `recent_logs` / `clear_logs` / `log_stats`
- `list_scopes` / `host_info` / `host_warn` / `host_error` / `host_debug`
