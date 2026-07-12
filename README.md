# Scribe

Modern macOS desktop app for writing and organizing documents — a local rich-text editor with a library, templates, and multi-format export.

Scribe runs locally on your Mac. No accounts, no cloud — documents, the database, and settings belong to the macOS user account running the app.

**Languages:** [English](README.md) · [Slovenčina](README.sk.md)

## Features

### Editor
- Rich-text editor built on **TipTap** / ProseMirror
- Switch between formatted text and **Markdown** source
- Formatting: headings, lists, checklists, tables, images, links, footnotes
- Slash commands (`/`), bubble menu, drag & drop blocks and images
- Wiki links (`[[document]]`), comments, math (KaTeX), code blocks (highlight.js)
- Print preview, page layout, headers/footers, watermarks, pagination
- **Focus mode** — minimal UI for distraction-free writing (`⌘⇧F`, exit with `Esc`)

### Library
- Tree-structured **folders** with drag & drop
- Full-text document search (**SQLite FTS5**)
- Favorites, trash, recent documents
- Command palette (`⌘K`) for quick access to documents and actions

### Documents
- Custom **`.scribe`** format + disk sync
- Templates (report, letter, resume, invoice, essay, …)
- Import: `.scribe`, `.pages`, `.md`, `.txt`, `.docx`, `.rtf`, `.doc`
- Export: **PDF**, **DOCX**, **Markdown**, **TXT**, **Pages**
- Auto-save and **revision history** with diff comparison

### Appearance & settings
- Light / dark / system theme + custom colors
- Random theme generation
- Configurable documents folder
- **Interface language:** Slovak or English (Settings → Appearance → Language)

## Tech stack

| Layer | Technology |
|--------|-------------|
| Desktop shell | [Tauri 2](https://v2.tauri.app/) (Rust) |
| Frontend | React 19, TypeScript, Vite 8 |
| Editor | TipTap 3 (ProseMirror) |
| UI | Tailwind CSS v4, Radix UI, shadcn-style components |
| Routing | TanStack Router |
| State | Redux Toolkit |
| i18n | i18next + react-i18next |
| Database | SQLite (rusqlite, WAL mode) |
| Tests | Vitest, Testing Library, `cargo test` |

## Requirements

- **macOS** (primary target platform)
- [Bun](https://bun.sh/) or Node.js 20+
- [Rust](https://rustup.rs/) 1.77+
- Xcode Command Line Tools (for Tauri build)

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
| `bun run tauri:dev` | Run the app in dev mode |
| `bun run tauri:dev:clean` | Dev mode with cleared Vite cache |
| `bun run tauri:build` | Production `.app` / installer build |
| `bun run build` | Frontend build only |
| `bun run test` | Frontend tests (Vitest) |
| `bun run test:backend` | Rust tests |
| `bun run test:all` | Both test suites |
| `bun run lint` | ESLint |

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

The selected language is persisted in `localStorage` (`scribe-locale`) and can be changed in **Settings → Appearance → Language**.

Not every screen is translated yet — settings, navigation, storage dialogs, and shortcuts are covered first. New UI should use translation keys from the start.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘N` | New document (templates) |
| `⌘S` | Save |
| `⌘K` | Command palette |
| `⌘O` | Import file |
| `⌘F` | Find in document |
| `⌘H` | Find and replace |
| `⌘Z` / `⌘⇧Z` | Undo / Redo |
| `⌘⇧F` | Focus mode |
| `⌘⇧L` | Toggle theme |
| `⌘,` | Settings |
| `Esc` | Exit focus mode |

The full list is in the app under **Settings → Shortcuts**.

## Project structure

```
scribe/
├── src/                          # React frontend
│   ├── components/
│   │   ├── editor/               # Panels, menus, pagination, diff
│   │   ├── editor-toolbar/       # Formatting toolbar
│   │   ├── layout/               # AppHeader, SidebarRail
│   │   ├── settings/             # Settings UI
│   │   └── ui/                   # shadcn-style primitives
│   ├── hooks/                    # Auto-save, hotkeys, pagination, …
│   ├── i18n/                     # Translations (en, sk)
│   ├── layouts/                  # AppLayout, SettingsLayout
│   ├── lib/
│   │   ├── db/                   # Tauri invoke API
│   │   ├── editor/               # TipTap extensions and helpers
│   │   ├── export/               # HTML, PDF, DOCX, Markdown
│   │   ├── revisions/            # Version comparison
│   │   └── themes/               # Themes and preset colors
│   ├── pages/                    # Home, Document, Settings
│   └── store/                    # Redux slices + persistence
├── src-tauri/                    # Rust backend
│   └── src/
│       ├── commands/             # Tauri commands (documents, folders, …)
│       ├── db/                   # SQLite, migrations, FTS, revisions
│       ├── export/               # File export
│       └── storage/              # .scribe files, sync, persist queue
└── src/__tests__/                # Vitest tests
```

## Development

### Tests

```bash
bun run test          # 77+ frontend tests
bun run test:backend  # Rust unit tests (migrations, export, storage)
```

### UI architecture

The app uses a three-column shell:

```
Icon rail (52px) | Library (252px) | Header + content
```

The editor includes a formatting toolbar, a “paper” canvas preview, a right panel rail (outline, comments, backlinks, stats, history), and a bottom status bar with pagination and print.

### Database migrations

The SQLite schema is versioned in `src-tauri/src/db/migrations.rs`. Migrations run automatically on app startup.

## Version

Current version: **0.4.0**
