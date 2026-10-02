# Storage Mode Files API

Design / analysis only — **not implemented in the repo yet**. Soft sandbox under `{documentsDir}/files/` for user files that are **not** document media.

Document media stays under `assets/{documentId}/` (`list_library_assets`) and stays **out of scope** for this API.

---

## Goals

- Give Storage Mode a second pane: a general file/folder browser beside the assets gallery.
- One JSON contract shared by Tauri UI, MCP agents, Python NLP helpers, and an optional GraphQL façade.
- Keep all ops inside `files/` via path join + reject `..` / absolute / `\` (same idea as `PathAccessGate` + `safe_join_under`).
- Prefer small, predictable commands over a mini VFS with every POSIX edge case.

## Non-goals (v1)

- Editing document `.scribe` / library DB through this API
- Sync / cloud / multi-device
- Fulltext index of file contents
- Streaming multi‑GB files through MCP (use soft size limits; large files → reveal in Finder)
- Public / remote exposure of the files sandbox without explicit auth (demo binds to loopback only)

---

## Demo server (planned — how you try the API)

**Yes:** after the Rust core exists, a small **local demo server** will wrap the same `storage_fs` API so you can call it with `curl`, a GraphQL playground, TypeScript `fetch`, or Python `httpx` — without opening the full Tauri app.

| Item | Plan |
|------|------|
| Bind | `127.0.0.1` only (default port e.g. `8787`) |
| Root | temp dir or `--documents-dir /path/to/demo` → uses `{dir}/files/` |
| Surfaces | REST JSON (`/v1/fs/…`) **and** GraphQL (`/graphql` + GraphiQL) |
| Auth | none on loopback for demo; refuse non-local binds unless `--allow-remote` + token |
| Binary | base64 in JSON / GraphQL (same contract as MCP) |
| Run | e.g. `cargo run -p scribe-storage-fs-demo -- --port 8787` |

```text
curl / GraphQL / TS / Python
        │
        ▼
┌───────────────────────────┐
│ demo server (127.0.0.1)   │
│  REST  /v1/fs/*           │
│  GQL   /graphql           │
└─────────────┬─────────────┘
              ▼
     scribe_core::storage_fs
              ▼
     {documentsDir}/files/
```

### Example REST calls (demo)

```bash
# list
curl -s 'http://127.0.0.1:8787/v1/fs/list?path=inbox'

# mkdir + write text
curl -s -X POST 'http://127.0.0.1:8787/v1/fs/mkdir' \
  -H 'content-type: application/json' \
  -d '{"path":"scratch/demo"}'

curl -s -X POST 'http://127.0.0.1:8787/v1/fs/write-text' \
  -H 'content-type: application/json' \
  -d '{"path":"scratch/demo/hello.md","text":"# hi\n","overwrite":true}'

# read text
curl -s 'http://127.0.0.1:8787/v1/fs/read-text?path=scratch/demo/hello.md'
```

### Example GraphQL (same server)

```bash
curl -s 'http://127.0.0.1:8787/graphql' \
  -H 'content-type: application/json' \
  -d '{"query":"query { storageFsList(path: \"inbox\") { count entries { path kind } } }"}'
```

Open GraphiQL in the browser: `http://127.0.0.1:8787/graphql` (if enabled).

### Status

| Step | State |
|------|--------|
| Design / contract in this doc | done |
| Rust `storage_fs` core | not in repo yet |
| Demo server binary | not in repo yet |
| Tauri / MCP / TS / Python wired to core | after core + demo |

So: **we will be able to run a demo server and call the API** — that is an explicit deliverable of the implementation phase, not something available today.

---

## In-app usage (Scribe desktop)

**Yes — the primary way to use this API is from inside the app**, without any HTTP server.

```text
Storage Mode UI (Files tab)
        │  filesApi.*()
        ▼
  Tauri invoke  storage_fs_*
        ▼
  scribe_core::storage_fs
        ▼
  {documentsDir}/files/     ← same library folder the app already uses
```

| Mode | How | Who |
|------|-----|-----|
| **In-app (default)** | TS `filesApi` → Tauri commands | Storage Mode Files tab, future pickers, agents inside Scribe |
| **Optional local API** | App starts embedded loopback server on demand | External `curl` / GraphQL / Python talking to the **same** `files/` root |
| **Standalone demo** | `cargo run -p scribe-storage-fs-demo` | Dev / CI without launching the UI |

### From the UI (planned)

1. Settings → Storage Mode **on** (already exists).
2. Open Storage Mode → tab **Media** | **Files**.
3. Files tab uses `filesApi.list / mkdir / writeText / delete / reveal / …` against the current library’s `documentsDir`.
4. Optional toggle: **“Local Files API server”** → start/stop embedded REST+GraphQL on `127.0.0.1:8787` (or next free port), status chip + Copy URL + Open GraphiQL.

When the embedded server runs from the app, it must use the **same** `documentsDir` as the open library (not a separate temp root), so UI and `curl` see identical files.

### Local API panel UI (planned — user sees every URL)

Place a **Local Files API** drawer / side rail on the Files tab (not buried only in Settings). Industrial / utilitarian: monospace URLs, sharp accent on “Live”, quiet chrome.

```text
┌─ Local Files API ──────────────────────────────────┐
│  ● Live · 127.0.0.1:8787          [Stop] [Copy all]│
│  Root  ~/Documents/Scribe/files/                   │
│  Loopback only · same library as this window       │
├─ Available URLs ───────────────────────────────────┤
│  GraphQL                                           │
│  POST  http://127.0.0.1:8787/graphql        [Copy]│
│  GET   http://127.0.0.1:8787/graphql        [Open]│  ← GraphiQL
│                                                    │
│  REST                                              │
│  GET   …/v1/fs/list?path=                   [Copy]│
│  GET   …/v1/fs/stat?path=                   [Copy]│
│  GET   …/v1/fs/read?path=                   [Copy]│
│  GET   …/v1/fs/read-text?path=              [Copy]│
│  GET   …/v1/fs/search?query=                [Copy]│
│  GET   …/v1/fs/disk-usage?path=             [Copy]│
│  GET   …/v1/fs/health                       [Copy]│
│  POST  …/v1/fs/mkdir                        [Copy]│
│  POST  …/v1/fs/write                        [Copy]│
│  POST  …/v1/fs/write-text                   [Copy]│
│  POST  …/v1/fs/delete                       [Copy]│
│  POST  …/v1/fs/rename                       [Copy]│
│  POST  …/v1/fs/copy                         [Copy]│
│  POST  …/v1/fs/ensure-defaults              [Copy]│
│                                                    │
│  Examples (filled with base URL)                   │
│  curl -s 'http://127.0.0.1:8787/v1/fs/list' [Copy]│
│  curl GraphQL BrowseInbox snippet           [Copy]│
└────────────────────────────────────────────────────┘
```

**States**

| State | UI |
|-------|-----|
| Stopped | Dim list still visible (so user learns endpoints); primary **Start server**; badge `Offline` |
| Starting | Spinner on Start; URLs disabled |
| Live | Green/amber **Live** pill; full URL list with real host:port; each row Copy; GraphiQL **Open** |
| Error | Inline error (port in use → suggest next port); Retry |

**URL catalog the panel always documents** (base = `http://127.0.0.1:{port}`):

| Method | Path | Shown label |
|--------|------|-------------|
| `GET` | `/v1/fs/health` | Health |
| `GET` | `/v1/fs/list` | List |
| `GET` | `/v1/fs/stat` | Stat |
| `GET` | `/v1/fs/exists` | Exists |
| `GET` | `/v1/fs/read` | Read (base64) |
| `GET` | `/v1/fs/read-text` | Read text |
| `GET` | `/v1/fs/search` | Search (`query`, optional `glob`, `path`, `limit`) |
| `GET` | `/v1/fs/disk-usage` | Disk usage |
| `POST` | `/v1/fs/mkdir` | Mkdir |
| `POST` | `/v1/fs/write` | Write bytes |
| `POST` | `/v1/fs/write-text` | Write text |
| `POST` | `/v1/fs/append` | Append bytes |
| `POST` | `/v1/fs/append-text` | Append text |
| `POST` | `/v1/fs/touch` | Touch / create empty |
| `POST` | `/v1/fs/delete` | Delete |
| `POST` | `/v1/fs/rename` | Rename |
| `POST` | `/v1/fs/move-into` | Move into dir |
| `POST` | `/v1/fs/copy` | Copy |
| `POST` | `/v1/fs/ensure-defaults` | Ensure defaults |
| `POST` | `/graphql` | GraphQL |
| `GET` | `/graphql` | GraphiQL playground |

**Interactions**

- Per-row **Copy** → clipboard full absolute URL (query placeholders kept, e.g. `?path=`).
- **Copy all** → markdown checklist of method + URL (for pasting into docs / Slack).
- **Open** on GraphiQL → system browser to `http://127.0.0.1:{port}/graphql`.
- Hover / focus: full URL in tooltip; click row selects for keyboard Copy (`⌘C`).
- When offline, still show paths as `/v1/fs/…` with note “Start server to get absolute URLs”.

**Visual direction** (match Storage Mode, not a generic card grid)

- One composition: Files browser left / main; API rail right (~320–360px) or bottom sheet on narrow windows.
- Monospace for URLs (`ui-monospace` / JetBrains Mono if already in app — avoid Inter).
- Method badges: muted `GET` / accent `POST`.
- Live pulse on status dot; no purple glow, no pill soup — one accent only.
- Motion: rail slides in on first open; URL rows stagger-fade when server goes Live.

### App commands for the embedded server (planned)

| Command | Purpose |
|---------|---------|
| `storage_fs_server_start` | `{ port? }` → `{ url, port, documentsDir }` |
| `storage_fs_server_stop` | stop listener |
| `storage_fs_server_status` | `{ running, url?, port?, documentsDir }` |

```ts
// Settings / Storage Mode — optional
const { url } = await invoke('storage_fs_server_start', { port: 8787 })
// url === "http://127.0.0.1:8787"
await invoke('storage_fs_server_stop')
```

Reveal / Finder and PathAccessGate stay on the Tauri path; the HTTP surface stays loopback-only.

---

## Layout on disk

```
{documentsDir}/
  assets/{documentId}/     ← existing media (out of scope)
  files/                   ← this API root (created on first write/mkdir)
    inbox/
    exports/
    notes/
    …
```

Suggested starter folders (optional, created by UI “Initialize” or first mkdir):

| Path | Intent |
|------|--------|
| `inbox/` | Drops / imports waiting to be filed |
| `exports/` | PDF / Markdown / zip dumps from Scribe |
| `scratch/` | Scratch pad for agents / NLP |
| `attachments/` | User-managed attachments not tied to a doc id |

---

## Path rules

| Rule | Detail |
|------|--------|
| Relative only | Client paths are relative to `files/` with POSIX `/` |
| No escape | Reject `..`, absolute (`/…`, `C:…`), `\`, NUL, empty segments `//` |
| Root | Empty string or `.` = `files/` itself (list/stat only; never delete/rename root) |
| Normalize | Collapse redundant `/`; trim trailing `/` except root |
| Case | Preserve FS case; do not invent case-folding |

Resolve: `absolute = documentsDir/files + safe_join(relative)`.

---

## Shared types (camelCase JSON)

### `StorageEntry`

```ts
type StorageEntryKind = 'file' | 'dir'

interface StorageEntry {
  path: string           // relative, e.g. "inbox/a.png"
  name: string           // basename
  kind: StorageEntryKind
  sizeBytes?: number     // files only
  modifiedAt?: number    // Unix seconds
  mimeHint?: string      // optional v1.1: from extension
  extension?: string     // optional v1.1: lowercased, no dot
}
```

### List result

```ts
interface StorageFsListResult {
  path: string           // listed directory (relative)
  count: number
  entries: StorageEntry[]
}
```

### Read result

```ts
interface StorageFsReadResult {
  path: string
  sizeBytes: number
  dataBase64: string     // raw bytes; data-URL prefix stripped on write
}
```

### Errors (string messages for Tauri/MCP; stable prefixes)

| Prefix | When |
|--------|------|
| `InvalidPath:` | `..`, absolute, bad chars |
| `NotFound:` | missing path |
| `AlreadyExists:` | write without overwrite / mkdir race |
| `NotADirectory:` | list on a file |
| `NotAFile:` | read on a dir |
| `NotEmpty:` | delete dir without `recursive` |
| `TooLarge:` | write/read over soft max |
| `RootProtected:` | delete/rename of `files/` root |
| `ReadOnly:` | MCP/session without writable DB |

---

## Commands (core surface)

| Command | Args | Result | Notes |
|---------|------|--------|--------|
| `storage_fs_list` | `path?`, `recursive?`, `depth?` | `StorageFsListResult` | Default non-recursive; `depth` caps recursion |
| `storage_fs_stat` | `path` | `StorageEntry` | Empty path = root dir entry |
| `storage_fs_mkdir` | `path` | `StorageEntry` | Creates parents; idempotent if dir exists |
| `storage_fs_write` | `path`, `dataBase64`, `overwrite?` | `StorageEntry` | Soft max **100 MiB**; creates parents |
| `storage_fs_read` | `path` | `StorageFsReadResult` | Soft max **100 MiB** |
| `storage_fs_delete` | `path`, `recursive?` | `{ ok, path }` | Dir needs `recursive: true` |
| `storage_fs_rename` | `from`, `to` | `StorageEntry` | Both under `files/`; no overwrite unless empty/missing `to` |
| `storage_fs_reveal` | `path` | `void` | Finder / Explorer via existing reveal helper |

### Extended commands (v1.1 — design now, ship later)

| Command | Args | Result | Purpose |
|---------|------|--------|---------|
| `storage_fs_copy` | `from`, `to`, `overwrite?` | `StorageEntry` | Duplicate without read/write round-trip |
| `storage_fs_exists` | `path` | `{ exists, kind? }` | Cheap probe without full stat errors |
| `storage_fs_touch` | `path` | `StorageEntry` | Create empty file or update mtime |
| `storage_fs_write_text` | `path`, `text`, `overwrite?` | `StorageEntry` | UTF-8 convenience (agents / notes) |
| `storage_fs_read_text` | `path`, `maxBytes?` | `{ path, text, sizeBytes }` | UTF-8; fail if not valid UTF-8 |
| `storage_fs_append` | `path`, `dataBase64` \| `text` | `StorageEntry` | Log / scratch append |
| `storage_fs_move_into` | `from`, `dir` | `StorageEntry` | Move keeping basename into dir |
| `storage_fs_search` | `query`, `path?`, `glob?`, `limit?` | `StorageEntry[]` | Name/glob only (no content) |
| `storage_fs_disk_usage` | `path?` | `{ path, totalBytes, fileCount, dirCount }` | Folder size for UI |
| `storage_fs_ensure_defaults` | — | `{ created: string[] }` | Create `inbox/`, `exports/`, … |
| `storage_fs_import_paths` | `absolutePaths[]` | `StorageEntry[]` | Copy **into** `files/` after PathAccessGate grant (picker) |
| `storage_fs_export` | `path`, `destAbsolute?` | `{ path }` | Copy **out** via save dialog / granted path |

Binary note: Tauri UI may later switch large payloads to raw IPC / custom protocol; MCP keeps base64 for tool JSON.

---

## Sample bindings overview

All four surfaces speak the **same contract** (paths relative to `files/`, camelCase JSON where crossing process boundaries). GraphQL is an optional façade over Rust core — not a second source of truth.

```text
┌─────────────┐  invoke   ┌──────────────┐
│ TypeScript  │ ────────► │ Tauri cmds   │──┐
└─────────────┘           └──────────────┘  │
┌─────────────┐  tools    ┌──────────────┐  │   ┌─────────────────┐
│ MCP / agent │ ────────► │ scribe-mcp   │──┼──►│ scribe_core::   │
└─────────────┘           └──────────────┘  │   │ storage_fs      │
┌─────────────┐  client   ┌──────────────┐  │   └─────────────────┘
│ Python NLP  │ ────────► │ MCP / FFI    │──┘            ▲
└─────────────┘           └──────────────┘               │
┌─────────────┐  HTTP     ┌──────────────┐               │
│ GraphQL     │ ────────► │ async-graphql│───────────────┘
│ (optional)  │           │ resolvers    │
└─────────────┘           └──────────────┘
```

---

## Sample API — TypeScript

Planned: `src/lib/storage/files-types.ts` + `src/lib/storage/files-api.ts`.

### Types

```ts
export type StorageEntryKind = 'file' | 'dir'

export interface StorageEntry {
  path: string
  name: string
  kind: StorageEntryKind
  sizeBytes?: number
  modifiedAt?: number
  mimeHint?: string
  extension?: string
}

export interface StorageFsListResult {
  path: string
  count: number
  entries: StorageEntry[]
}

export interface StorageFsReadResult {
  path: string
  sizeBytes: number
  dataBase64: string
}

export interface StorageFsDiskUsage {
  path: string
  totalBytes: number
  fileCount: number
  dirCount: number
}

export const STORAGE_FS_COMMANDS = {
  list: 'storage_fs_list',
  stat: 'storage_fs_stat',
  mkdir: 'storage_fs_mkdir',
  write: 'storage_fs_write',
  writeText: 'storage_fs_write_text',
  read: 'storage_fs_read',
  readText: 'storage_fs_read_text',
  delete: 'storage_fs_delete',
  rename: 'storage_fs_rename',
  copy: 'storage_fs_copy',
  search: 'storage_fs_search',
  reveal: 'storage_fs_reveal',
  ensureDefaults: 'storage_fs_ensure_defaults',
  diskUsage: 'storage_fs_disk_usage',
} as const
```

### Client

```ts
import { invoke } from '@/lib/tauri'
import {
  STORAGE_FS_COMMANDS,
  type StorageEntry,
  type StorageFsDiskUsage,
  type StorageFsListResult,
  type StorageFsReadResult,
} from '@/lib/storage/files-types'

function bytesToBase64(data: Uint8Array): string {
  let s = ''
  for (let i = 0; i < data.length; i++) s += String.fromCharCode(data[i]!)
  return btoa(s)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.includes(',') ? b64.split(',')[1]! : b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export const filesApi = {
  list(path = '', opts?: { recursive?: boolean; depth?: number }) {
    return invoke<StorageFsListResult>(STORAGE_FS_COMMANDS.list, {
      path,
      recursive: opts?.recursive ?? false,
      depth: opts?.depth,
    })
  },

  stat(path: string) {
    return invoke<StorageEntry>(STORAGE_FS_COMMANDS.stat, { path })
  },

  mkdir(path: string) {
    return invoke<StorageEntry>(STORAGE_FS_COMMANDS.mkdir, { path })
  },

  async writeBytes(path: string, data: Uint8Array, overwrite = false) {
    return invoke<StorageEntry>(STORAGE_FS_COMMANDS.write, {
      path,
      dataBase64: bytesToBase64(data),
      overwrite,
    })
  },

  writeText(path: string, text: string, overwrite = false) {
    return invoke<StorageEntry>(STORAGE_FS_COMMANDS.writeText, {
      path,
      text,
      overwrite,
    })
  },

  async readBytes(path: string) {
    const r = await invoke<StorageFsReadResult>(STORAGE_FS_COMMANDS.read, { path })
    return base64ToBytes(r.dataBase64)
  },

  readText(path: string, maxBytes?: number) {
    return invoke<{ path: string; text: string; sizeBytes: number }>(
      STORAGE_FS_COMMANDS.readText,
      { path, maxBytes },
    )
  },

  remove(path: string, recursive = false) {
    return invoke<{ ok: boolean; path: string }>(STORAGE_FS_COMMANDS.delete, {
      path,
      recursive,
    })
  },

  rename(from: string, to: string) {
    return invoke<StorageEntry>(STORAGE_FS_COMMANDS.rename, { from, to })
  },

  copy(from: string, to: string, overwrite = false) {
    return invoke<StorageEntry>(STORAGE_FS_COMMANDS.copy, { from, to, overwrite })
  },

  search(query: string, opts?: { path?: string; glob?: string; limit?: number }) {
    return invoke<StorageEntry[]>(STORAGE_FS_COMMANDS.search, { query, ...opts })
  },

  reveal(path: string) {
    return invoke<void>(STORAGE_FS_COMMANDS.reveal, { path })
  },

  ensureDefaults() {
    return invoke<{ created: string[] }>(STORAGE_FS_COMMANDS.ensureDefaults)
  },

  diskUsage(path = '') {
    return invoke<StorageFsDiskUsage>(STORAGE_FS_COMMANDS.diskUsage, { path })
  },
}
```

### Usage examples

```ts
// Browse inbox
const listing = await filesApi.list('inbox')
for (const e of listing.entries) {
  console.log(e.kind, e.path, e.sizeBytes)
}

// Create folder + note
await filesApi.mkdir('exports/2026-09')
await filesApi.writeText('scratch/agent-note.md', '# Hello from UI\n', true)

// Binary round-trip
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
await filesApi.writeBytes('inbox/tiny.png', png, true)
const back = await filesApi.readBytes('inbox/tiny.png')

// Search + reveal
const hits = await filesApi.search('summary', { path: 'exports', glob: '*.md', limit: 20 })
if (hits[0]) await filesApi.reveal(hits[0].path)

// Disk usage chip
const usage = await filesApi.diskUsage('exports')
// → { path: "exports", totalBytes: 1048576, fileCount: 12, dirCount: 3 }
```

### Raw Tauri invoke (same commands)

```ts
await invoke('storage_fs_list', { path: 'inbox', recursive: false })
await invoke('storage_fs_write', {
  path: 'scratch/hello.txt',
  dataBase64: btoa('hello'),
  overwrite: true,
})
await invoke('storage_fs_rename', {
  from: 'scratch/hello.txt',
  to: 'inbox/hello.txt',
})
```

---

## Sample API — Rust

Planned: `crates/scribe-core/src/storage_fs.rs` (+ thin Tauri wrappers).

### Public surface

```rust
// crates/scribe-core/src/storage_fs.rs  (planned)

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const MAX_WRITE_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StorageEntryKind {
    File,
    Dir,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageEntry {
    pub path: String,
    pub name: String,
    pub kind: StorageEntryKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extension: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ListOpts {
    pub path: Option<String>,
    pub recursive: bool,
    pub depth: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskUsage {
    pub path: String,
    pub total_bytes: u64,
    pub file_count: u64,
    pub dir_count: u64,
}

pub fn ensure_files_root(documents_dir: &Path) -> Result<PathBuf, String>;
pub fn safe_join_under(root: &Path, relative: &str) -> Result<PathBuf, String>;

pub fn list(documents_dir: &Path, opts: ListOpts) -> Result<Vec<StorageEntry>, String>;
pub fn stat(documents_dir: &Path, path: &str) -> Result<StorageEntry, String>;
pub fn mkdir(documents_dir: &Path, path: &str) -> Result<StorageEntry, String>;
pub fn write_file(
    documents_dir: &Path,
    path: &str,
    bytes: &[u8],
    overwrite: bool,
) -> Result<StorageEntry, String>;
pub fn write_text(
    documents_dir: &Path,
    path: &str,
    text: &str,
    overwrite: bool,
) -> Result<StorageEntry, String>;
pub fn read_file(documents_dir: &Path, path: &str) -> Result<Vec<u8>, String>;
pub fn read_text(
    documents_dir: &Path,
    path: &str,
    max_bytes: Option<u64>,
) -> Result<String, String>;
pub fn delete(documents_dir: &Path, path: &str, recursive: bool) -> Result<(), String>;
pub fn rename(documents_dir: &Path, from: &str, to: &str) -> Result<StorageEntry, String>;
pub fn copy(
    documents_dir: &Path,
    from: &str,
    to: &str,
    overwrite: bool,
) -> Result<StorageEntry, String>;
pub fn search(
    documents_dir: &Path,
    query: &str,
    path: Option<&str>,
    glob: Option<&str>,
    limit: Option<usize>,
) -> Result<Vec<StorageEntry>, String>;
pub fn disk_usage(documents_dir: &Path, path: &str) -> Result<DiskUsage, String>;
pub fn ensure_defaults(documents_dir: &Path) -> Result<Vec<String>, String>;
```

### Usage example

```rust
use scribe_core::storage_fs::{self, ListOpts};

let dir = store.documents_dir()?;
storage_fs::ensure_defaults(&dir)?;

storage_fs::mkdir(&dir, "exports/2026-W40")?;
storage_fs::write_text(
    &dir,
    "exports/2026-W40/summary.md",
    "# Weekly summary\n",
    true,
)?;

let entries = storage_fs::list(
    &dir,
    ListOpts {
        path: Some("exports".into()),
        recursive: true,
        depth: Some(3),
    },
)?;

let usage = storage_fs::disk_usage(&dir, "exports")?;
assert!(usage.file_count >= 1);

let bytes = storage_fs::read_file(&dir, "exports/2026-W40/summary.md")?;
```

### Tauri command wrapper sketch

```rust
// src-tauri/src/commands/storage_fs.rs  (planned)

#[tauri::command]
pub fn storage_fs_list(
    app: AppHandle,
    state: State<'_, DbState>,
    path: Option<String>,
    recursive: Option<bool>,
    depth: Option<u32>,
) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let dir = storage::get_documents_dir(&app, &conn)?;
    let entries = scribe_core::storage_fs::list(
        &dir,
        scribe_core::storage_fs::ListOpts {
            path,
            recursive: recursive.unwrap_or(false),
            depth,
        },
    )?;
    Ok(serde_json::json!({
        "path": entries.first().map(|e| parent_of(&e.path)).unwrap_or(""),
        "count": entries.len(),
        "entries": entries,
    }))
}

// storage_fs_stat / mkdir / write / read / delete / rename / …
// reveal → PathAccessGate::validate_reveal + reveal_in_finder
```

Security: never take absolute client paths for in-sandbox ops; import/export use PathAccessGate-granted absolutes only on dedicated commands.

---

## Sample API — Python

Planned: `nlp/scribe_nlp/storage_fs.py` (thin MCP / local bridge client).

### Client

```python
# nlp/scribe_nlp/storage_fs.py  (planned)
from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any, Literal

EntryKind = Literal["file", "dir"]


@dataclass
class StorageEntry:
    path: str
    name: str
    kind: EntryKind
    size_bytes: int | None = None
    modified_at: int | None = None
    mime_hint: str | None = None
    extension: str | None = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> StorageEntry:
        return cls(
            path=d["path"],
            name=d["name"],
            kind=d["kind"],
            size_bytes=d.get("sizeBytes"),
            modified_at=d.get("modifiedAt"),
            mime_hint=d.get("mimeHint"),
            extension=d.get("extension"),
        )


class StorageFsClient:
    """Same storage_fs_* contract via MCP tool calls or a local RPC bridge."""

    def __init__(self, call_tool):  # call_tool(name: str, args: dict) -> Any
        self._call = call_tool

    def list(
        self,
        path: str = "",
        *,
        recursive: bool = False,
        depth: int | None = None,
    ) -> list[StorageEntry]:
        raw = self._call(
            "storage_fs_list",
            {"path": path, "recursive": recursive, "depth": depth},
        )
        return [StorageEntry.from_dict(e) for e in raw.get("entries", raw)]

    def stat(self, path: str) -> StorageEntry:
        return StorageEntry.from_dict(self._call("storage_fs_stat", {"path": path}))

    def mkdir(self, path: str) -> StorageEntry:
        return StorageEntry.from_dict(self._call("storage_fs_mkdir", {"path": path}))

    def write_bytes(self, path: str, data: bytes, *, overwrite: bool = False) -> StorageEntry:
        return StorageEntry.from_dict(
            self._call(
                "storage_fs_write",
                {
                    "path": path,
                    "dataBase64": base64.b64encode(data).decode("ascii"),
                    "overwrite": overwrite,
                },
            )
        )

    def write_text(self, path: str, text: str, *, overwrite: bool = False) -> StorageEntry:
        return StorageEntry.from_dict(
            self._call(
                "storage_fs_write_text",
                {"path": path, "text": text, "overwrite": overwrite},
            )
        )

    def read_bytes(self, path: str) -> bytes:
        raw = self._call("storage_fs_read", {"path": path})
        return base64.b64decode(raw["dataBase64"])

    def read_text(self, path: str, *, max_bytes: int | None = None) -> str:
        raw = self._call(
            "storage_fs_read_text",
            {"path": path, "maxBytes": max_bytes},
        )
        return raw["text"]

    def delete(self, path: str, *, recursive: bool = False) -> None:
        self._call("storage_fs_delete", {"path": path, "recursive": recursive})

    def rename(self, src: str, dst: str) -> StorageEntry:
        return StorageEntry.from_dict(
            self._call("storage_fs_rename", {"from": src, "to": dst})
        )

    def copy(self, src: str, dst: str, *, overwrite: bool = False) -> StorageEntry:
        return StorageEntry.from_dict(
            self._call(
                "storage_fs_copy",
                {"from": src, "to": dst, "overwrite": overwrite},
            )
        )

    def search(
        self,
        query: str,
        *,
        path: str = "",
        glob: str | None = None,
        limit: int = 100,
    ) -> list[StorageEntry]:
        raw = self._call(
            "storage_fs_search",
            {"query": query, "path": path, "glob": glob, "limit": limit},
        )
        return [StorageEntry.from_dict(e) for e in raw]

    def disk_usage(self, path: str = "") -> dict[str, Any]:
        return self._call("storage_fs_disk_usage", {"path": path})

    def ensure_defaults(self) -> list[str]:
        return self._call("storage_fs_ensure_defaults", {}).get("created", [])
```

### Usage examples

```python
import json

fs = StorageFsClient(call_tool)  # injected MCP / bridge

fs.ensure_defaults()
fs.mkdir("scratch/nlp")
fs.write_text(
    "scratch/nlp/tokens.json",
    json.dumps({"tokens": ["hello", "world"]}, indent=2),
    overwrite=True,
)

entries = fs.list("scratch/nlp")
text = fs.read_text("scratch/nlp/tokens.json")
fs.rename("scratch/nlp/tokens.json", "exports/tokens.json")

hits = fs.search("tokens", path="exports", glob="*.json")
usage = fs.disk_usage("exports")
print(usage["totalBytes"], len(hits))
```

---

## Sample API — MCP tools

Same names as Tauri commands. Writable tools require a writable DB session (`ReadOnly:` otherwise).

| Tool | Example args |
|------|----------------|
| `storage_fs_list` | `{ "path": "inbox", "recursive": true, "depth": 3 }` |
| `storage_fs_stat` | `{ "path": "inbox/shot.png" }` |
| `storage_fs_mkdir` | `{ "path": "exports/weekly" }` |
| `storage_fs_write` | `{ "path": "scratch/out.bin", "dataBase64": "…", "overwrite": true }` |
| `storage_fs_write_text` | `{ "path": "scratch/note.md", "text": "# hi", "overwrite": true }` |
| `storage_fs_read` / `read_text` | `{ "path": "scratch/note.md" }` |
| `storage_fs_delete` | `{ "path": "scratch/old", "recursive": true }` |
| `storage_fs_rename` | `{ "from": "a.txt", "to": "inbox/a.txt" }` |
| `storage_fs_search` | `{ "query": "report", "glob": "*.md", "limit": 50 }` |
| `storage_fs_disk_usage` | `{ "path": "exports" }` |

Agent recipe:

1. `storage_fs_ensure_defaults`
2. `storage_fs_write_text` → `scratch/summary.md`
3. `storage_fs_rename` → `exports/summary.md`
4. `storage_fs_reveal` so the user sees it in Finder

---

## Sample API — GraphQL support (optional façade)

Scribe does **not** ship GraphQL today. This is a planned optional layer (e.g. local `async-graphql` in a sidecar or future headless API) that **resolves to the same Rust `storage_fs` core**. Binary payloads stay base64 in GraphQL (same as MCP); prefer `writeText` / `readText` for notes.

### Schema

```graphql
# docs/storage-fs.graphql  (planned)

enum StorageEntryKind {
  FILE
  DIR
}

type StorageEntry {
  path: String!
  name: String!
  kind: StorageEntryKind!
  sizeBytes: Float
  modifiedAt: Float
  mimeHint: String
  extension: String
}

type StorageFsListResult {
  path: String!
  count: Int!
  entries: [StorageEntry!]!
}

type StorageFsReadResult {
  path: String!
  sizeBytes: Float!
  dataBase64: String!
}

type StorageFsTextResult {
  path: String!
  text: String!
  sizeBytes: Float!
}

type StorageFsDiskUsage {
  path: String!
  totalBytes: Float!
  fileCount: Int!
  dirCount: Int!
}

type StorageFsDeleteResult {
  ok: Boolean!
  path: String!
}

type StorageFsEnsureDefaultsResult {
  created: [String!]!
}

type Query {
  storageFsList(
    path: String = ""
    recursive: Boolean = false
    depth: Int
  ): StorageFsListResult!

  storageFsStat(path: String!): StorageEntry!

  storageFsExists(path: String!): Boolean!

  storageFsRead(path: String!): StorageFsReadResult!

  storageFsReadText(path: String!, maxBytes: Float): StorageFsTextResult!

  storageFsSearch(
    query: String!
    path: String = ""
    glob: String
    limit: Int = 100
  ): [StorageEntry!]!

  storageFsDiskUsage(path: String = ""): StorageFsDiskUsage!
}

type Mutation {
  storageFsMkdir(path: String!): StorageEntry!

  storageFsWrite(
    path: String!
    dataBase64: String!
    overwrite: Boolean = false
  ): StorageEntry!

  storageFsWriteText(
    path: String!
    text: String!
    overwrite: Boolean = false
  ): StorageEntry!

  storageFsDelete(path: String!, recursive: Boolean = false): StorageFsDeleteResult!

  storageFsRename(from: String!, to: String!): StorageEntry!

  storageFsCopy(
    from: String!
    to: String!
    overwrite: Boolean = false
  ): StorageEntry!

  storageFsEnsureDefaults: StorageFsEnsureDefaultsResult!

  """Desktop-only; no-op or error on headless GraphQL hosts."""
  storageFsReveal(path: String!): Boolean!
}
```

### Example queries / mutations

```graphql
query BrowseInbox {
  storageFsList(path: "inbox", recursive: false) {
    path
    count
    entries {
      path
      name
      kind
      sizeBytes
      modifiedAt
    }
  }
  storageFsDiskUsage(path: "inbox") {
    totalBytes
    fileCount
    dirCount
  }
}

query ReadNote {
  storageFsReadText(path: "scratch/agent-note.md") {
    path
    text
    sizeBytes
  }
}

mutation ExportSummary {
  storageFsMkdir(path: "exports/2026-W40") {
    path
    kind
  }
  storageFsWriteText(
    path: "exports/2026-W40/summary.md"
    text: "# Weekly summary\n"
    overwrite: true
  ) {
    path
    sizeBytes
  }
  storageFsRename(from: "scratch/draft.md", to: "exports/2026-W40/draft.md") {
    path
  }
}

mutation BinaryWrite {
  storageFsWrite(
    path: "inbox/tiny.bin"
    dataBase64: "AQID"
    overwrite: true
  ) {
    path
    sizeBytes
  }
}
```

### TypeScript GraphQL client sketch

```ts
// optional — when a local GraphQL endpoint exists
const QUERY = /* GraphQL */ `
  query ($path: String!) {
    storageFsList(path: $path) {
      count
      entries { path name kind sizeBytes }
    }
  }
`

const data = await graphqlClient.request(QUERY, { path: 'inbox' })
```

### Python GraphQL client sketch

```python
from gql import Client, gql  # planned optional dependency

query = gql("""
  query ($path: String!) {
    storageFsList(path: $path) {
      count
      entries { path name kind sizeBytes }
    }
  }
""")
result = await client.execute_async(query, variable_values={"path": "inbox"})
```

### Mapping note

| GraphQL field | Rust core |
|---------------|-----------|
| `storageFsList` | `storage_fs::list` |
| `storageFsWrite` / `WriteText` | `write_file` / `write_text` |
| `storageFsRead` / `ReadText` | `read_file` / `read_text` |
| `FILE` / `DIR` enums | serialize as `file` / `dir` at JSON edges; GraphQL uses SCREAMING_SNAKE |

Prefer enabling GraphQL only behind an explicit feature flag / local bind (e.g. `127.0.0.1`) — never expose the sandbox remotely without auth.

---

## Limits & policy

| Limit | Value | Rationale |
|-------|-------|-----------|
| Max write/read bytes | 100 MiB | Soft; UI should warn; agents use text helpers for notes |
| Max list entries | 5_000 (suggested) | Truncate + `truncated: true` flag later |
| Max path length | 512 chars relative | Avoid pathological trees |
| Symlinks | Do not follow out of `files/`; prefer reject symlinks in v1 | Escape prevention |
| Hidden files | Include in list; UI may filter `.*` | |

---

## vs Assets gallery

| | `assets/{docId}/` | `files/` |
|--|-------------------|----------|
| Owner | Document media pipeline | User / agent general store |
| API today | `list_library_assets` | *(this design)* |
| Kinds | image / svg / lottie / model3d / other | file / dir only |
| UI | Storage Mode gallery (current) | Files browser tab (follow-up) |
| Delete | Via document/asset flows | `storage_fs_delete` |

Do **not** merge roots; Storage Mode can show two tabs: **Media** | **Files**.

---

## UI follow-up (not this doc’s implementation)

1. Toggle already exists: Settings → Storage Mode.
2. Add Files tab: breadcrumb + list/grid + mkdir / rename / delete / reveal (via `filesApi`, no HTTP).
3. Drag-drop → `storage_fs_import_paths` or write after picker grant.
4. Empty state → `storage_fs_ensure_defaults` + short copy.
5. Disk usage chip via `storage_fs_disk_usage`.
6. **Local Files API panel**: Start/Stop, Live badge, full URL catalog (REST + GraphQL + GraphiQL), per-URL Copy, Copy all, Open GraphiQL — see [Local API panel UI](#local-api-panel-ui-planned--user-sees-every-url).

---

## Planned bindings (when implementing)

| Layer | Location |
|-------|----------|
| Rust core | `crates/scribe-core/src/storage_fs.rs` |
| Tauri | `src-tauri/src/commands/storage_fs.rs` |
| TypeScript | `src/lib/storage/files-api.ts` + `files-types.ts` |
| MCP | `storage_fs_*` in `scribe-mcp` + `docs/tools.md` |
| Python | `nlp/scribe_nlp/storage_fs.py` |
| GraphQL (optional) | schema + resolvers over Rust core; local bind only |
| Demo server | small binary: REST + GraphQL on `127.0.0.1` wrapping the same core |
| In-app UI | Storage Mode Files tab → Tauri `storage_fs_*` |
| In-app embedded API | optional start/stop loopback server sharing library `documentsDir` |

Until then this file is the source of truth for the contract.

---

## Example end-to-end scenarios

### A. User drops a PNG into inbox

1. UI picker / drop → grant path → `storage_fs_import_paths(["/Users/…/shot.png"])`
2. Result entry `inbox/shot.png`
3. Optional `storage_fs_reveal("inbox/shot.png")`

### B. Agent writes a weekly export note

1. `storage_fs_mkdir` `exports/2026-W40`
2. `storage_fs_write_text` `exports/2026-W40/summary.md`
3. `storage_fs_disk_usage` `exports`

### C. Clean scratch

1. `storage_fs_list` `scratch` recursive
2. `storage_fs_delete` `scratch` `recursive: true`
3. `storage_fs_mkdir` `scratch`

### D. Rename collision

1. `storage_fs_stat` `inbox/a.txt` → exists  
2. `storage_fs_rename` `draft/a.txt` → `inbox/a.txt` → `AlreadyExists:`  
3. UI asks overwrite → delete target or rename to `inbox/a-2.txt`

---

## Open decisions

- [ ] Ship text helpers (`write_text` / `read_text`) in v1 or v1.1?
- [ ] Import from Finder: copy vs move?
- [ ] Should MCP omit `reveal` on headless hosts?
- [ ] Truncation flag on huge directories vs hard error?
- [ ] MIME sniffing vs extension-only `mimeHint`?
- [ ] GraphQL: ship with core or keep as optional feature flag / sidecar only?
- [ ] GraphQL auth model if ever bound beyond `127.0.0.1`?
- [ ] Demo server: separate crate (`scribe-storage-fs-demo`) vs feature on `scribe-mcp`?
- [ ] Demo default documents dir: temp vs `./.scribe-fs-demo`?
