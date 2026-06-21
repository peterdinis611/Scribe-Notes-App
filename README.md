# Scribe

Moderná macOS desktopová aplikácia pre písanie dokumentov — alternatíva k Apple Pages s dôrazom na čistý rich-text editing a jednoduchú organizáciu súborov.

## Stack

- **Tauri 2** (Rust backend)
- **React 18+ / TypeScript** (frontend)
- **TipTap** (ProseMirror rich-text editor)
- **Tailwind CSS v4** + shadcn/ui komponenty
- **Jotai** (state management)
- **SQLite** cez rusqlite (lokálne ukladanie)

## Aktuálny stav (MVP – krok 1)

- ✅ Tauri 2 + React + TypeScript projekt
- ✅ SQLite schéma (`documents`, `folders`, `meta`) + migrácie
- ✅ Tauri commands pre CRUD dokumentov
- ✅ TipTap editor so StarterKit + Typography
- ✅ Auto-save (debounced 600 ms) do SQLite ako TipTap JSON
- ✅ Sidebar s výberom/vytvorením/mazaním dokumentov
- ✅ macOS overlay titlebar + dark/light mode podľa systému
- ✅ Plávajúci editor toolbar

## Spustenie

```bash
cd scribe
npm install
npm run tauri:dev
```

## Štruktúra

```
scribe/
├── src/
│   ├── components/     # Sidebar, Editor, Toolbar, UI
│   ├── lib/
│   │   ├── db/         # Tauri invoke API
│   │   └── editor/     # TipTap extensions
│   └── store/          # Jotai atoms
└── src-tauri/
    └── src/
        ├── db/           # SQLite init + migrácie
        └── commands/     # Rust Tauri commands
```

## Ďalšie kroky

- [x] Stromová štruktúra priečinkov + drag & drop
- [x] Cmd+K vyhľadávanie
- [x] Slash commands (/)
- [x] Tabuľky, obrázky, komentáre
- [x] Export PDF / DOCX / Markdown
- [x] FTS5 fulltextové vyhľadávanie
- [x] Persistentná undo/redo história
