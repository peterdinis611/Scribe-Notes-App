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

- `withGlobalTauri` is **off** — frontend uses `@tauri-apps/api` only (no `window.__TAURI__`).
- `connect-src` is narrowed to IPC + loopback Files API (`127.0.0.1:*` / `:8787`) + Vite HMR (`localhost:5174`). Font CSS loads via `style-src` / `font-src`, not open `localhost:*`.
- `style-src 'unsafe-inline'` remains for TipTap / editor chrome; nonce-based CSP is a Priority 3 follow-up.

`assetProtocol.scope` is limited to app data / documents / temp / cache — not `$HOME/**`.

`opener` is limited to GitHub project URLs + loopback (not `https://*`).

## Files API (port 8787)

- Off until started from Settings / Storage Mode.
- Bound to `127.0.0.1` only.
- Random bearer token with **30 min TTL**; clients must send `Authorization: Bearer <token>`.
- Settings can **rotate** (new secret) or **refresh** (extend TTL) the token.
- Per-IP rate limit (~60 req/min).
- Unauthenticated `GET /v1/fs/health` returns `{ ok, auth: "required" }` without directory paths.
- Browser docs may use `?access_token=` for `/docs` and `/openapi.json` only.

## Mobile capture

- Default bind: `127.0.0.1`. LAN (`0.0.0.0`) is an explicit opt-in (audited).
- Short-lived session token (**15 min TTL**) in the URL **hash** (not query / Referer).
- `POST /api/capture` requires Bearer / `X-Scribe-Capture-Token` **and** a one-time form nonce (`X-Scribe-Capture-Nonce`, issued on `GET /`, rotated after each attempt).
- Auto-stops after **15 minutes** without page load or successful POST (idle timeout).
- Per-IP rate limit.

## MCP

- Default **read-only**. Set `SCRIBE_MCP_WRITE=1` to enable write tools (startup warning).
- Vault scope defaults to `no-vault`. Non-default scopes log a warning at startup.
- **Never** put `SCRIBE_MCP_WRITE=1` or `SCRIBE_MCP_SCOPE=full` in shared / team Cursor MCP configs — local override only.

## NLP sidecar

- Spawned with `env_clear()` + allowlisted env (`PATH` = interpreter dir only, `PYTHONPATH`, temp, HF cache under temp).
- Real `HOME` is **not** forwarded — sandbox home under `$TMPDIR/scribe-nlp-home`.
- `SCRIBE_NLP_SANDBOX=1` arms a Python `builtins.open` deny-list for Scribe DB / SSH / keychain paths.
- macOS: optional Seatbelt via `SCRIBE_NLP_SEATBELT=1` (`sandbox-exec`); `SCRIBE_NLP_NO_SEATBELT=1` disables.
- `PYTHONNOUSERSITE=1`, working directory = script dir.

## UI surfaces / plugins

- `ui_surface_event` allow-lists `data-sui-event` names in Rust.
- Bridge JS filters the same set and avoids `postMessage(..., '*')`.
- Bundled plugins are trusted; **installed** `.scribe-ext` plugins get a restricted permission set and cannot access Tauri IPC globals during `activate`.
- Elevated capabilities (`nlp.skills`, `mcp.tools`) require an explicit per-plugin user grant in Settings.

## Editor HTML / SVG

- Clipboard / Word paste is normalized in Rust (`normalize_clipboard_html`) — strips script/style/iframe/object/embed/svg/base and dangerous attrs.
- Mermaid / chart SVG is sanitized before `innerHTML`.

## Vault

- Passwords live only in RAM while unlocked.
- Auto-lock on idle (~15 minutes), tab hide, and page hide.
- Lock clears session password fields (best-effort; JS strings are immutable).
- Unlock events are audited.

## Backups

- Manual library export may use optional **AES-256 ZIP** password (`password` arg to `export_library_archive`).
- Automatic backup password is stored in the **OS keychain** (`com.scribe.app` / `auto-backup-password`); legacy SQLite meta values are migrated then deleted.
- Import accepts an optional password for encrypted archives.

## Hardened runtime (macOS)

- Releases build with **Hardened Runtime** + `src-tauri/entitlements.plist`.
- Full App Sandbox is deferred until NLP seatbelt/XPC isolation (Priority 1 → then Priority 3 App Sandbox).

## Command allowlist notes

App commands are ACL-grouped under `src-tauri/permissions/` (28 groups). Capability `main` gets `main-all-commands`; `secondary` (pdf-export / scribe-ui) gets only UI-surface commands. Regenerate with `python3 scripts/gen-tauri-command-permissions.py`.

Risky path-bearing commands must not grant from raw JS strings:

| Command | Path source |
|---------|-------------|
| `pick_and_grant_path` / `pick_and_grant_save_path` | Native dialog |
| `pick_and_import_file` | Native dialog |
| `grant_dropped_paths` | Native drag-drop (also Rust `on_window_event`) |
| `read_*` / `write_text_file` / `import_file` | Validate via `PathAccessGate` only |
| `extract_image_ocr` / `save_document_ocr` / `remove_image_background` | Temp or `PathAccessGate::validate_read` |
| `audit_security_event` | Allowlisted actions only |

CI fails if a new path-bearing `#[tauri::command]` appears without an entry in `scripts/tauri-path-commands.allowlist`.

## Antivirus on import

- Rust `import_file` / `pick_and_import_file` always apply `AntivirusPolicy` (FE prefs when provided, otherwise secure defaults: scan + block/quarantine).
- FE SheetJS Excel/CSV import also calls `assertImportAllowedByAntivirus` before parse.
- Disabling scan is an explicit user policy change — omitting the IPC arg no longer skips the gate.

## SheetJS / spreadsheet import

- FE parse is dynamically imported and capped (`MAX_EXCEL_BYTES`, `sheetRows`, sheet/col limits).
- Known SheetJS community CVEs remain ignored in `bun audit` until an upstream fix; size limits shrink blast radius.

## CI

- `.github/workflows/security-audit.yml` — `bun audit` + `cargo audit` + `cargo deny` + path-command inventory + **`pip-audit` on `nlp/`** (hashed `nlp/requirements.lock` when present)
- Dependabot — npm + cargo + GitHub Actions
- Regenerate NLP lockfile: `bash nlp/scripts/gen-requirements-lock.sh`

## Roadmap

### Priority 1 (highest impact)

| Item | Status | Notes |
|------|--------|--------|
| SQLCipher / DB at-rest encryption | Foundation | `db_crypto::open_library_connection` + `DbKey`; feature `sqlcipher` not on by default. Next: vendored SQLCipher, keychain key, migrate plaintext → encrypted |
| NLP isolation (seatbelt / XPC) | In progress | Env: no real `HOME`, narrow `PATH`, Python `SCRIBE_NLP_SANDBOX` open-guard. macOS `sandbox-exec` opt-in via `SCRIBE_NLP_SEATBELT=1`. Next: default-on seatbelt + XPC helper |
| Narrow IPC / command capabilities | In progress | 28 permission groups + `main` / `secondary` capabilities; secondary windows lose documents/nlp/fs-gated commands. CI: `check_tauri_command_permissions.py` |

### Priority 2 (quick wins)

| Item | Status |
|------|--------|
| Enforce AV in Rust on import | Done |
| `pip-audit` + hashed NLP lockfile | Done (CI + `requirements.in`) |
| Disable `withGlobalTauri` | Done |
| Tighter CSP / `connect-src` | Done (nonce CSP deferred) |
| MCP: never WRITE/SCOPE=full in shared configs | Done (docs + example) |
| SheetJS size limits + isolated parse | Done |

### Priority 3 (larger projects)

- Full App Sandbox (after NLP isolation)
- Vault: Argon2id + unlock in Rust (password never enters the JS heap)
- Stronger plugin sandbox (iframe / WASM, not JS globals alone)
- Signed releases + SBOM

## Out of scope (still)

- Physical attacker with unlocked macOS session and keychain access
- Compromised OS kernel / SIP bypass
- Cloud sync (Scribe has none)
- Full memory forensics against JS string immutability for vault passwords
- Unix-domain socket / mTLS for Files API (until Priority 1 IPC work)

## Reporting

Open a private security advisory or issue on the project repository. Do not file public issues with exploit details for unfixed vulnerabilities.
