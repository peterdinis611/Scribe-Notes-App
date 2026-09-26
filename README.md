# Scribe 2.3

<p align="center">
  <img src="docs/screenshots/icon.png" alt="Scribe icon" width="96" height="96" />
</p>

Write documents. Link notes. **Scribe 2.3** is a local macOS rich-text editor with a library, templates, and multi-format export.

Scribe runs locally on your Mac. No accounts, no cloud — documents, the database, and settings belong to the macOS user account running the app.

**Languages:** [English](README.md) · [Slovenčina](README.sk.md)

## Screenshots

<p align="center">
  <img src="docs/screenshots/home.png" alt="Scribe home screen" width="820" />
</p>

<p align="center"><em>Home — new document, daily note, import</em></p>

<p align="center">
  <img src="docs/screenshots/editor.png" alt="Scribe document editor" width="820" />
</p>

<p align="center"><em>Editor — print layout, library sidebar, wiki links</em></p>

<p align="center">
  <img src="docs/screenshots/templates.png" alt="Scribe template picker" width="820" />
</p>

<p align="center"><em>Templates — blank page, canvas, report, invoice, and more</em></p>

<p align="center">
  <img src="docs/screenshots/graph.png" alt="Scribe wiki connection map" width="820" />
</p>

<p align="center"><em>Connection map — wiki links between notes</em></p>

<p align="center">
  <img src="docs/screenshots/docs.png" alt="Scribe in-app documentation" width="820" />
</p>

<p align="center"><em>In-app docs — library, wiki, Local AI, backups</em></p>

<p align="center">
  <img src="docs/screenshots/onboarding.png" alt="Scribe onboarding" width="820" />
</p>

<p align="center"><em>First-run welcome (Slovak UI shown)</em></p>

<p align="center">
  <img src="docs/screenshots/settings-appearance.png" alt="Scribe appearance settings" width="400" />
  &nbsp;
  <img src="docs/screenshots/settings-nlp.png" alt="Scribe Local AI settings" width="400" />
</p>

<p align="center"><em>Settings — Appearance · Local AI</em></p>

<p align="center">
  <img src="docs/screenshots/settings-mcp.png" alt="Scribe MCP settings" width="820" />
</p>

<p align="center"><em>Settings — optional MCP bridge for Cursor / Claude</em></p>

## Features

### Editor
- Rich-text editor built on **TipTap** / ProseMirror
- Switch between formatted text and **Markdown** source
- Formatting: headings, lists, checklists, tables, images (caption, [React Image Crop](https://github.com/dominictobias/react-image-crop), full-width), links, footnotes
- Slash commands (`/`), bubble menu, drag & drop blocks and images; library folders and editor tabs use React DnD
- Block **snippets** via slash (meeting notes, decision, …)
- Wiki links (`[[document]]`), embeds (`![[document]]`), comments, math (math.js), Mermaid diagrams, D3 charts (JSON spec: bar / line / area / pie), videos (React Player), maps (React Leaflet / OpenStreetMap), code blocks (React Syntax Highlighter)
- **Print layout** — paginated page preview with margins, headers/footers, watermarks; quiet blank-page hero when empty
- **Focus mode** — minimal UI for distraction-free writing (`⌘⇧F`, exit with `Esc`)
- **Canvas notes** — freeform cards and connectors (`type: canvas`) on [React Flow](https://reactflow.dev/) for whiteboard-style thinking

### Library
- Tree-structured **folders** with drag & drop
- Full-text document search (**SQLite FTS5**)
- Favorites, trash with **Undo** toast, recent documents, **daily notes** with calendar heat map
- **Weekly digest** — turn journal/NLP summary into a document (`⌘K`)
- Library-wide **find & replace** across TipTap text (`⌘⇧H`)
- Wiki **connection map** (`/graph`): local graph (double-click node), filters, tag/folder colors
- Backlinks panel + **unlinked mentions**
- Command palette (`⌘K`) with fuzzy matching, recent docs, and wiki targets
- **Pinned tabs** — keep documents open until you unpin them
- Optional MCP bridge for AI tools (Cursor / Claude) — Settings → MCP; see [`crates/scribe-mcp/`](crates/scribe-mcp/)
- Optional **Local AI** (Python sidecar **0.8**): semantic search, summary, keywords/outline/tone/dates, duplicates, journal digest, library report, spell check — see below and [`nlp/README.md`](nlp/README.md)

### Documents
- Custom **`.scribe`** format + disk sync
- Templates (report, letter, resume, invoice, essay, …) plus **template packs** (import/export `.scribe-templates.json`, Slovak bundles)
- Import: `.scribe`, `.pages`, `.md`, `.txt`, `.docx`, `.rtf`, `.doc`
- Export: **PDF**, **DOCX**, **Markdown**, **TXT**, **Pages**; export **selection** to MD/PDF
- **Share package** — local PDF or HTML-ZIP revealed in Finder (AirDrop-friendly; no cloud hosting)
- Folder **auto-sync** when the documents directory lives in iCloud Drive / Dropbox (multi-Mac tip in Settings)
- Auto-save and **revision history** with diff comparison

### Appearance & settings
- Light / dark / system theme + custom colors
- Random theme generation
- Configurable documents folder
- **Interface language:** Slovak or English (Settings → Appearance → Language)
- Optional **MCP setup** in Settings (power users)

## Tech stack

| Layer | Technology |
|--------|-------------|
| Desktop shell | [Tauri 2](https://v2.tauri.app/) (Rust) + plugins: dialog, fs, opener, [persisted-scope](https://v2.tauri.app/plugin/persisted-scope/), [positioner](https://v2.tauri.app/plugin/positioner/), [global-shortcut](https://v2.tauri.app/plugin/global-shortcut/) |
| Frontend | React 19, TypeScript, Vite 8 |
| Editor | TipTap 3 (ProseMirror) |
| UI | Tailwind CSS v4, Radix UI, shadcn-style components |
| Routing | TanStack Router |
| State | Redux Toolkit |
| i18n | i18next + react-i18next |
| Database | SQLite (rusqlite, WAL mode) |
| Local AI | Python **3.10+** stdlib sidecar ([`nlp/`](nlp/)) — optional `sentence-transformers` |
| Mobile (iOS/Android) | [`@tauri-apps/plugin-barcode-scanner`](https://v2.tauri.app/plugin/barcode-scanner/) — QR / barcode → insert into note |
| Tests | Vitest, Testing Library, `cargo test`, `nlp:test` |

## Requirements

- **macOS** (primary target platform)
- [Bun](https://bun.sh/) or Node.js 20+
- [Rust](https://rustup.rs/) 1.77+
- Xcode Command Line Tools (for Tauri build)
- **Python 3.10+** (`python3` on `PATH`) — only required when using **Local AI**

## Getting started

```bash
git clone <repo-url>
cd scribe
bun install
bun run tauri:dev
```

With npm:

```bash
npm install
npm run tauri:dev
```

The dev server runs at `http://localhost:5174`. On first launch, Tauri downloads and compiles Rust dependencies — this can take several minutes.

## Scripts

| Command | Description |
|--------|-------------|
| `bun run tauri:dev` | Run the app in dev mode (+ build MCP release binary in parallel) |
| `bun run tauri:dev:debug` | Same + Rust/NLP/frontend debug logging |
| `bun run tauri:dev:clean` | Dev mode with cleared Vite cache |
| `bun run tauri:dev:app` | Tauri only (skip MCP build) |
| `bun run tauri:dev:app:debug` | Tauri only with debug env flags |
| `bun run tauri:build` | Production `.app` / installer build |
| `bun run build` | Frontend build only |
| `bun run dev` | Vite only (browser, no Tauri IPC) |
| `bun run dev:debug` | Vite only with `VITE_DEBUG=1` |
| `bun run test` | Frontend tests (Vitest) |
| `bun run test:backend` | Rust tests |
| `bun run test:all` | Frontend + Rust + NLP tests |
| `bun run lint` | ESLint |
| `npm run nlp:health` | Ping Local AI sidecar (JSON-RPC health) |
| `npm run nlp:debug` | Local AI debug CLI (stderr timings + sample analyze) |
| `npm run nlp:test` | Python NLP unit tests |
| `npm run mcp:install` | Build Rust Scribe Memory MCP (`scribe-mcp`) |
| `npm run mcp` | Run MCP server (stdio, release) |
| `npm run mcp:debug` | Run MCP server (debug build + `RUST_LOG=debug`) |

## Local AI (Python)

Optional offline intelligence. Enable in **Settings → Local AI**. Scribe starts a small Python process (`nlp/scribe_nlp/`) over stdin/stdout JSON-RPC — document text **never leaves your Mac**.

| | |
|--|--|
| **Runtime** | Python **3.10+**, standard library only by default |
| **Sidecar version** | **0.8.1** |
| **Default embed model** | `scribe-hash-v4` (stem/diacritic-aware; chunk mean-pool for long notes) |
| **Optional quality** | `pip install sentence-transformers` → MiniLM (`scribe-minilm-v1`), cached under `~/.cache/scribe-nlp/models` |
| **What you get** | Semantic ⌘K search, AI insights (summary, tone, dates, links, keywords), tag suggestions, journal week tone, library report, revision diff summary |

```bash
# health check
npm run nlp:health

# unit tests (~50)
npm run nlp:test

# optional better embeddings
pip install 'sentence-transformers>=3'
# then Settings → Local AI → quality backend + Reindex
```

Full method list and design notes: [`nlp/README.md`](nlp/README.md). After a model bump (e.g. `v3` → `v4`), run **Reindex** in settings.

## Debug modes

| Layer | Command / env | What you get |
|-------|----------------|--------------|
| All (recommended) | `npm run tauri:dev:debug` | Rust + NLP + Vite debug flags together |
| Frontend | `npm run dev:debug` or `VITE_DEBUG=1` | Console `[scribe-fe]` logs, sourcemaps via `TAURI_DEBUG` |
| Rust | `SCRIBE_RUST_LOG=debug` / `RUST_LOG=debug` / `SCRIBE_DEBUG=1` | `tauri-plugin-log` at Debug + NLP RPC traces |
| NLP | `SCRIBE_NLP_DEBUG=1` or `npm run nlp:debug` | Sidecar stderr timings per RPC (stdout stays JSON-RPC) |
| MCP | `npm run mcp:debug` | Debug cargo build of `scribe-mcp` |

## Scribe Memory MCP (Claude / Cursor)

Optional power feature: expose your local notes to Claude Desktop or Cursor via MCP. Everyday writing does not require it. The server prefers a **writable** connection (`create_note` / `append_to_note`) and falls back to **read-only** if the DB is locked. Encrypted **vault** notes are excluded by default (`SCRIBE_MCP_SCOPE=no-vault`). In-app: **Settings → MCP**.

- Overview: [`crates/scribe-mcp/README.md`](crates/scribe-mcp/README.md) · docs [`crates/scribe-mcp/docs/`](crates/scribe-mcp/docs/README.md)

```bash
npm run mcp:install
npm run mcp
```

## Data storage

Scribe stores data locally on disk:

| What | Where (default) |
|------|------------------|
| SQLite database | `~/Library/Application Support/com.scribe.app/scribe.db` |
| Documents (`.scribe`) | `~/Documents/Scribe/` |
| Document images | `~/Documents/Scribe/assets/` |
| PDF exports | `~/Documents/Scribe/pdf/` |

You can change the documents folder in **Settings → Storage**. The app does not implement multi-user accounts — isolation is at the macOS user level.

## Internationalization (i18n)

Translations live in:

```
src/i18n/
├── index.ts          # i18next setup
└── locales/
    ├── en.json       # English
    └── sk.json       # Slovak (default)
```

To add or change UI strings:

1. Add the key to both `en.json` and `sk.json`
2. Use `useTranslation()` in React components: `t('settings.language.title')`
3. Outside React, import `i18n` from `@/i18n` and call `i18n.t(...)`

The selected language is persisted in IndexedDB (`scribe-locale`) and can be changed in **Settings → Appearance → Language**.

Not every screen is translated yet — settings, navigation, storage dialogs, and shortcuts are covered first. New UI should use translation keys from the start.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘N` | New document (templates) |
| `⌘S` | Save |
| `⌘K` | Command palette |
| `⌘O` | Import file |
| `⌘F` | Find in document |
| `⌘H` | Find and replace (current document) |
| `⌘⇧H` | Find and replace in library |
| `⌘Z` / `⌘⇧Z` | Undo / Redo |
| `⌘⇧F` | Focus mode |
| `⌘⇧L` | Toggle theme |
| `⌘,` | Settings |
| `Esc` | Exit focus mode |

The full list is in the app under **Settings → Shortcuts**.

## Project structure

Scribe is a **local-first desktop app**: the React UI talks to a Rust Tauri shell, which owns SQLite and optional Python Local AI. An optional MCP process can read/write the same database for Cursor / Claude.

```
┌─────────────────────────────────────────────────────────────┐
│  React UI (src/)                                            │
│  pages · components · Redux store · TipTap editor           │
│  lib/db/*  ──invoke()──►  Tauri commands                    │
└───────────────────────────────┬─────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────┐
│  Tauri shell (src-tauri/)                                   │
│  IPC commands · storage watch · export · OCR · libraries    │
│           │                                                 │
│           ▼                                                 │
│  scribe-core (crates/scribe-core/)                          │
│  SQLite schema · FTS · wiki · vault · NLP bridge            │
│           │                                                 │
│           ▼  (optional, when Local AI is enabled)           │
│  Python sidecar (nlp/scribe_nlp/)  stdin/stdout JSON-RPC    │
└─────────────────────────────────────────────────────────────┘
        ▲
        │ same DB (optional)
┌───────┴────────┐
│  scribe-mcp    │  Claude / Cursor tools over stdio
└────────────────┘
```

**Rule of thumb**

| You want to change… | Start here |
|---------------------|------------|
| Buttons, dialogs, layout | `src/components/`, `src/pages/` |
| App state (open doc, theme, UI dialogs) | `src/store/` |
| TipTap nodes, slash menu, block API | `src/lib/editor/` (`block-api.ts`, `block-registry.ts`, `extensions.ts`) |
| Calls into Rust (`invoke`) | `src/lib/db/` |
| SQLite / documents / sync | `crates/scribe-core/` + `src-tauri/src/commands/` |
| Local AI algorithms | `nlp/scribe_nlp/` (exposed via `src-tauri/src/commands/nlp.rs`) |
| Agent tools for Cursor/Claude | `crates/scribe-mcp/` |
| Translations | `src/i18n/locales/{en,sk}.json` |

### Directory map

```
scribe/
├── src/                          # React + TypeScript frontend (Vite)
│   ├── main.tsx / App.tsx        # Bootstrap, providers
│   ├── router.tsx                # TanStack Router routes
│   ├── index.css                 # Tailwind v4 + remaining global chrome
│   ├── components/               # UI by feature
│   │   ├── canvas/               # Freeform canvas notes (React Flow)
│   │   ├── editor/               # Panels, menus, TOC, comments, overlays
│   │   ├── editor-toolbar/       # Formatting ribbon
│   │   ├── layout/               # Header, icon rail, document tabs
│   │   ├── library/              # Switcher, compile, sync conflicts
│   │   ├── settings/             # Settings sections
│   │   ├── pdf/                  # Structured PDF preview building blocks
│   │   └── ui/                   # Shared primitives (button, dialog, …)
│   ├── hooks/                    # Auto-save, hotkeys, pagination, sync
│   ├── i18n/                     # i18next + en/sk locale JSON
│   ├── layouts/                  # AppLayout, SettingsLayout
│   ├── lib/                      # Domain logic (prefer this over fat components)
│   │   ├── db/                   # Typed Tauri invoke wrappers (documents, NLP, …)
│   │   ├── editor/               # TipTap extensions, slash, block registry/snippets
│   │   ├── export/               # HTML / PDF / DOCX / Markdown / share packs
│   │   ├── disk-sync.ts          # Folder reconcile + toasts
│   │   └── themes/               # Theme presets
│   ├── pages/                    # Route-level screens
│   ├── store/                    # Redux Toolkit slices + persistence
│   └── __tests__/                # Vitest (mirrors lib/ + components/)
│
├── src-tauri/                    # Tauri 2 desktop shell
│   ├── tauri.conf.json           # Window, bundle, resources (incl. nlp/)
│   └── src/
│       ├── commands/             # #[tauri::command] IPC surface
│       ├── db/                   # App DB helpers / migrations wiring
│       ├── storage/              # .scribe files, FS watch, write queue
│       ├── export/               # Native export helpers
│       └── nlp/                  # Sidecar process management
│
├── crates/
│   ├── scribe-core/              # Shared Rust library (DB, wiki, NLP types, placeholder text)
│   └── scribe-mcp/               # Optional MCP server binary
│
├── nlp/                          # Optional Local AI (Python 3.10+)
│   ├── scribe_nlp/               # JSON-RPC methods: embed, analyze, placeholder, …
│   ├── tests/                    # unittest (`bun run nlp:test`)
│   └── README.md                 # Method list + design notes
│
├── brand/                        # Icons / marketing assets
├── docs/                         # Screenshots used in this README
├── scripts/                      # Dev helpers (version sync, Tauri+MCP, …)
└── .github/workflows/            # CI + Tauri build
```

### How a typical feature flows

1. **UI** — React component in `src/components/` or `src/pages/` calls a hook or `lib/` helper.
2. **State** — Redux (`src/store/`) holds ephemeral UI + document list; durable prefs go through persistence helpers.
3. **IPC** — `src/lib/db/*.ts` wraps `invoke('command_name', …)`.
4. **Rust** — `src-tauri/src/commands/` validates input, then uses `scribe-core` for SQLite / file IO.
5. **Local AI (optional)** — NLP commands talk to the Python sidecar over JSON-RPC; if the sidecar is off, features either degrade or use a Rust fallback (e.g. placeholder / lorem text, continue-writing n-grams).
6. **Smart paste** — dirty Word/Pages/web HTML is normalized in Rust (`html_paste`) before TipTap insert.

### Editor / block layer

The document body is **TipTap JSON** stored in SQLite (`content_json`) and mirrored to `.scribe` files when folder sync is on.

- **`src/lib/editor/extensions.ts`** — registers TipTap nodes (callout, mermaid, video, …).
- **`src/lib/editor/block-registry.ts`** — slash-insertable built-in blocks (`insertBlock('hr')`, …).
- **`src/lib/editor/block-snippets.ts`** — reusable templates (plain text or TipTap JSON), including user custom blocks.
- **`src/lib/editor/block-api.ts`** — public facade for registry + snippets (`insertAnyBlock`, import/export, favorites).

Prefer composing existing blocks / snippets before adding a new TipTap node type.

### UI chrome

Three-column shell:

```
Icon rail (~52px) | Library panel | Header + editor / page content
```

The editor adds a formatting toolbar, document tabs (pin), print-layout “paper”, a right rail (outline, comments, backlinks, stats, history), and a status bar (pagination / print). Styling is mostly **Tailwind utility classes** in TSX; `src/index.css` keeps theme tokens, TipTap chrome, and remaining global layout.

## Development

### Tests

| Command | Description |
|--------|-------------|
| `bun run test` | Frontend (Vitest) |
| `bun run test:backend` | Rust workspace |
| `bun run nlp:test` | Python NLP |
| `bun run test:all` | All of the above |

GitHub Actions (`.github/workflows/`):

- **CI** — on `v*` version tags (or manual dispatch): version sync check; frontend lint + Vitest + Vite build; NLP tests; Rust tests on **macOS**, **Ubuntu**, and **Windows**
- **Build** — on `v*` version tags (or manual dispatch): version sync check; Tauri build (macOS ships `.app`/`.dmg` artifacts; Linux/Windows compile with `--no-bundle` until those platforms are productized)


```bash
bun run test          # 200+ frontend tests
bun run test:backend  # Rust unit tests (migrations, export, storage)
npm run nlp:test      # Python Local AI sidecar tests
bun run test:all      # frontend + Rust + NLP
```

### Database migrations

The SQLite schema is versioned in `src-tauri/src/db/migrations.rs` (and shared helpers in `crates/scribe-core/`). Migrations run automatically on app startup.

## Version

Current version: **2.3.0**

## Privacy

Scribe is local-first: notes stay on your Mac. Optional features you start (fonts, embeds, MCP hosts, LAN capture) are described in [Privacy Policy](PRIVACY.md) ([Slovenčina](PRIVACY.sk.md)). The same notice is in the app under Settings → Privacy.

## License

[MIT](LICENSE) © 2026 Peter Dinis
