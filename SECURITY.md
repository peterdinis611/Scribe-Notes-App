# Security

Scribe is a local-first notes app. This document summarizes the threat model and hardening defaults.

## Threat model

### Assets

- Local library SQLite DB and on-disk `.scribe` documents
- Vault passwords (RAM-only while unlocked) and ciphertext in SQLite
- Loopback HTTP tokens (Files API, mobile capture)
- Audit log (`scribe-audit.db`)
- NLP embeddings / models cached on disk

### Trust boundary

| Zone | Trust |
|------|--------|
| Webview (React) | **Untrusted** — XSS / compromised plugin must not grant FS or vault |
| Tauri Rust core | Trusted — enforces path gates, CSP, capabilities |
| NLP Python sidecar | Semi-trusted — sandboxed env, no inherited secrets |
| MCP process | Semi-trusted — default read-only, vault scope `no-vault` |
| Loopback HTTP | Untrusted network peers — bearer + TTL + rate limit |

### In scope

- Local privilege escalation via webview → FS / vault / IPC
- Abuse of opt-in LAN capture or Files API on shared Wi‑Fi
- XSS via Mermaid/SVG/UI surfaces
- Supply-chain / dependency CVEs (CI audit)

### Out of scope

- Physical attacker with unlocked macOS session and keychain access
- Compromised OS kernel / SIP bypass
- Cloud sync (Scribe has none)
- Full memory forensics against JS string immutability for vault passwords

## Path access

- Reads/writes outside the documents dir, app data, and temp require a path that was granted by a **native file picker or drag-and-drop** in Rust.
- Prefer `pick_and_grant_path` / `pick_and_grant_save_path` / `pick_and_import_file`.
- Grant matching is prefix-of-granted-root only (no reverse-prefix privilege escalation).
- Path grants are written to the security audit log.

## Content Security Policy

`tauri.conf.json` sets a non-null CSP. Violations fire `securitypolicyviolation` in the webview (logged + audit when possible). `report-uri` points at the IPC bridge for tooling.

`assetProtocol.scope` is limited to app data / documents / temp / cache — not `$HOME/**`.

`opener` is limited to GitHub project URLs + loopback (not `https://*`).

## Files API (port 8787)

- Off until started from Settings / Storage Mode.
- Bound to `127.0.0.1` only.
- Random bearer token with **1h TTL**; clients must send `Authorization: Bearer <token>`.
- Per-IP rate limit (~60 req/min).
- Unauthenticated `GET /v1/fs/health` returns `{ ok, auth: "required" }` without directory paths.
- Browser docs may use `?access_token=` for `/docs` and `/openapi.json` only.

## Mobile capture

- Default bind: `127.0.0.1`. LAN (`0.0.0.0`) is an explicit opt-in (audited).
- Short-lived session token (**15 min TTL**) in the URL **hash** (not query / Referer).
- `POST /api/capture` requires Bearer / `X-Scribe-Capture-Token` **and** a one-time form nonce (`X-Scribe-Capture-Nonce`, issued on `GET /`, rotated after each attempt).
- Per-IP rate limit.

## MCP

- Default **read-only**. Set `SCRIBE_MCP_WRITE=1` to enable write tools (startup warning).
- Vault scope defaults to `no-vault`. Non-default scopes log a warning at startup.

## NLP sidecar

- Spawned with `env_clear()` + allowlisted env (`PATH`, `PYTHONPATH`, temp, HF cache under temp).
- `PYTHONNOUSERSITE=1`, working directory = script dir.

## UI surfaces / plugins

- `ui_surface_event` allow-lists `data-sui-event` names in Rust.
- Bridge JS filters the same set and avoids `postMessage(..., '*')`.
- Bundled plugins are trusted; **installed** `.scribe-ext` plugins get a restricted permission set and cannot access Tauri IPC globals during `activate`.

## Editor SVG

- Mermaid / chart SVG is sanitized before `innerHTML`.

## Vault

- Passwords live only in RAM while unlocked.
- Auto-lock on idle (~15 minutes), tab hide, and page hide.
- Lock clears session password fields (best-effort; JS strings are immutable).
- Unlock events are audited.

## Backups

- Manual library export may use optional **AES-256 ZIP** password (`password` arg to `export_library_archive`).
- Automatic backups can use the same AES-256 encryption via `set_auto_backup_password` (stored in local SQLite meta; same trust boundary as the library).
- Import accepts an optional password for encrypted archives.

## Command allowlist notes

Risky path-bearing commands must not grant from raw JS strings:

| Command | Path source |
|---------|-------------|
| `pick_and_grant_path` / `pick_and_grant_save_path` | Native dialog |
| `pick_and_import_file` | Native dialog |
| `grant_dropped_paths` | Native drag-drop (also Rust `on_window_event`) |
| `read_*` / `write_text_file` / `import_file` | Validate via `PathAccessGate` only |
| `audit_security_event` | Allowlisted actions only |

## CI

- `.github/workflows/security-audit.yml` — `npm audit` + `cargo audit`
- Dependabot — npm + cargo + GitHub Actions

## Reporting

Open a private security advisory or issue on the project repository. Do not file public issues with exploit details for unfixed vulnerabilities.
