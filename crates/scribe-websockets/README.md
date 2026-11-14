# scribe-websockets

Local WebSocket **protocol + settings + optional sync server** for Scribe realtime events.

Default build is I/O-free (serde only). Feature `server` adds `tungstenite` `handle_connection`.

Keep `src/lib/websockets/` in sync.

## Hosts

| Host | Role |
|------|------|
| Tauri (`src-tauri/src/websockets`) | Accept loop, token session, start/stop/status |
| FE `@/lib/websockets` | Types, client helper, IPC |
| MCP | Protocol-only dep (no server feature required) |

## Settings

| Field | Default | Notes |
|-------|---------|-------|
| `enabled` | `false` | Opt-in |
| `bindHost` | `127.0.0.1` | Loopback only from prefs |
| `port` | `8789` | Avoids FS API `8787` / MCP `8788` |
| `path` | `/ws` | Upgrade path |
| `requireToken` | `true` | `hello.token` required |
| `heartbeatIntervalMs` | `30000` | Host hint |
| `maxConnections` | `8` | Cap concurrent clients |
| `maxMessageBytes` | `65536` | Frame size guard |
| `allowedOrigins` | tauri + localhost | Deduped allowlist |

## Channels

`system` · `documents` · `audit` · `nlp` · `sync` · `agent` · `capture`

## Protocol (v1)

Client → server: `hello` · `subscribe` · `unsubscribe` · `ping`  
Server → client: `welcome` · `event` · `subscribed` · `unsubscribed` · `pong` · `error`

## API

- Settings: `default_websocket_settings` / `normalize_*` / `websocket_url`
- Session: `ConnectionSession::handle_client`
- Hub: `Hub::broadcast_event` / `register` / `set_channels`
- Server (`feature = "server"`): `handle_connection`
