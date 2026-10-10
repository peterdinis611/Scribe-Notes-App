# Security

Scribe is a local-first notes app. This document summarizes the threat model and hardening defaults.

## Trust boundary

- The webview (React UI) is **untrusted** relative to the filesystem and vault passwords.
- Native Rust commands enforce path allow-lists (`PathAccessGate`), CSP, and capability scopes.
- Loopback HTTP helpers (Files API, mobile capture) are **opt-in** and authenticated.

## Path access

- Reads/writes outside the documents dir, app data, and temp require a path that was granted by a **native file picker or drag-and-drop** in Rust.
- Arbitrary JS strings cannot call `grant_scoped_path` anymore. Prefer `pick_and_grant_path` / `pick_and_grant_save_path` / `pick_and_import_file`.
- Grant matching is prefix-of-granted-root only (no reverse-prefix privilege escalation).

## Content Security Policy

`tauri.conf.json` sets a non-null CSP: scripts from `self`, styles with `'unsafe-inline'` (for editor chrome), connect to IPC + localhost NLP, no `object-src`.

`assetProtocol.scope` is limited to app data / documents / temp / cache — not `$HOME/**`.

## Files API (port 8787)

- Off until started from Settings / Storage Mode.
- Bound to `127.0.0.1` only.
- Issues a random bearer token at start; clients must send `Authorization: Bearer <token>`.
- Unauthenticated `GET /v1/fs/health` returns `{ ok, auth: "required" }` without directory paths.
- Browser docs may use `?access_token=` for `/docs` and `/openapi.json` only.

## Mobile capture

- Default bind: `127.0.0.1`. LAN (`0.0.0.0`) is an explicit opt-in.
- Capture URL puts the token in the **URL hash** (not query) so it is not sent as a request query / Referer.
- `POST /api/capture` requires `Authorization: Bearer` (or `X-Scribe-Capture-Token`).

## MCP

- Default **read-only**. Set `SCRIBE_MCP_WRITE=1` to enable write tools.
- Vault scope defaults to `no-vault`. Non-default scopes log a warning at startup.

## UI surfaces

- `ui_surface_event` allow-lists `data-sui-event` names in Rust.
- Bridge JS filters the same set and avoids `postMessage(..., '*')`.

## Editor SVG

- Mermaid / chart SVG is sanitized before `innerHTML` (strips script, event handlers, `javascript:` URLs).

## Vault

- Passwords live only in RAM while unlocked.
- Auto-lock on idle (~15 minutes), tab hide, and page hide.

## Reporting

Open a private security advisory or issue on the project repository. Do not file public issues with exploit details for unfixed vulnerabilities.
