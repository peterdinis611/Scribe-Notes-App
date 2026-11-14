# scribe-websockets

Local WebSocket **protocol + settings** for Scribe realtime events (documents, audit, NLP, sync, agent, capture).

Pure domain crate — no TCP / tungstenite. Hosts own the accept loop; this crate owns channels, JSON frames, and prefs.

Keep `src/lib/websockets/` in sync.

## Hosts

| Host | Role |
|------|------|
| Tauri | Settings normalize commands; future local WS server |
| FE `@/lib/websockets` | Types, encode/decode, URL helper (vitest without Tauri) |
| MCP | Optional status / docs surface |

## Settings

| Field | Default | Notes |
|-------|---------|-------|
| `enabled` | `false` | Opt-in local server |
| `bindHost` | `127.0.0.1` | Loopback only (rejects `0.0.0.0`) |
| `port` | `8787` | Clamp ≥ 1024 |
| `path` | `/ws` | HTTP upgrade path |
| `requireToken` | `true` | Hello must carry a token when host enforces auth |
| `heartbeatIntervalMs` | `30000` | Ping cadence hint |
| `maxConnections` | `8` | Cap concurrent clients |
| `maxMessageBytes` | `65536` | Frame size guard |
| `allowedOrigins` | tauri + localhost | Deduped allowlist |

## Channels

`system` · `documents` · `audit` · `nlp` · `sync` · `agent` · `capture`

## Protocol (v1)

Client → server: `hello` · `subscribe` · `unsubscribe` · `ping`  
Server → client: `welcome` · `event` · `subscribed` · `unsubscribed` · `pong` · `error`

## API

- `default_websocket_settings` / `normalize_websocket_settings` / `websocket_settings_from_json`
- `websocket_url`
- `encode_*` / `decode_*` frame helpers
- `normalize_channel_list` / `WebsocketChannel` / `channel_ids`
