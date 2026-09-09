# Scribe

Píšte dokumenty. Prepájajte poznámky. Lokálny macOS rich-text editor s knižnicou, šablónami a exportom do viacerých formátov.

Scribe beží lokálne na vašom Macu. Žiadne účty, žiadny cloud — dokumenty, databáza a nastavenia patria používateľovi macOS účtu, v ktorom je aplikácia spustená.

**Jazyky:** [English](README.md) · [Slovenčina](README.sk.md)

## Funkcie

### Editor
- Rich-text editor postavený na **TipTap** / ProseMirror
- Prepínanie medzi formátovaným textom a **Markdown** zdrojákom
- Formátovanie: nadpisy, zoznamy, checklisty, tabuľky, obrázky (popisok, orezanie, full-width), odkazy, poznámky pod čiarou
- Slash príkazy (`/`), bubble menu, drag & drop blokov a obrázkov
- Blokové **snipety** cez slash (meeting notes, decision, …)
- Wiki odkazy (`[[dokument]]`), embedy (`![[dokument]]`), komentáre, matematika (math.js), Mermaid diagramy, code bloky (highlight.js)
- **Print layout** — stránkovaný náhľad s okrajmi, hlavičkami/pätami, vodotlačou; jemný hero na prázdnej stránke
- **Režim sústredenia** — minimal UI pre nerušené písanie (`⌘⇧F`, ukončenie cez `Esc`)
- **Canvas poznámky** — voľné karty a spojenia (`type: canvas`) pre ľahké whiteboard myslenie

### Knižnica
- Stromová štruktúra **priečinkov** s drag & drop
- Fulltextové vyhľadávanie dokumentov (**SQLite FTS5**)
- Obľúbené, kôš s toastom **Vrátiť**, nedávne dokumenty, **denné poznámky** s calendar heat map
- **Týždenný digest** — súhrn z denníka/NLP do dokumentu (`⌘K`)
- **Nájsť a nahradiť** v celej knižnici cez TipTap text (`⌘⇧H`)
- **Mapa prepojení** (`/graph`): lokálny graf (dvojklik na uzol), filtre, farby podľa tagu/priečinka
- Panel backlinkov + **unlinked mentions**
- Príkazová paleta (`⌘K`) s fuzzy matchingom, nedávnymi dokumentmi a wiki cieľmi
- **Pripnuté taby** — dokumenty ostanú otvorené, kým ich neodopneš
- Voliteľný MCP most pre AI nástroje (Cursor / Claude) — Nastavenia → MCP; pozri [`crates/scribe-mcp/`](crates/scribe-mcp/)
- Voliteľná **Lokálna AI** (Python sidecar **0.7**): sémantické hľadanie, zhrnutie, kľúčové slová/osnova/tón/dátumy, duplikáty, denníkový digest, analýza knižnice — pozri nižšie a [`nlp/README.md`](nlp/README.md)

### Dokumenty
- Vlastný formát **`.scribe`** + synchronizácia na disk
- Šablóny (report, list, životopis, faktúra, esej, …) plus **balíky šablón** (import/export `.scribe-templates.json`, SK balíky)
- Import: `.scribe`, `.pages`, `.md`, `.txt`, `.docx`, `.rtf`, `.doc`
- Export: **PDF**, **DOCX**, **Markdown**, **TXT**, **Pages**; export **výberu** do MD/PDF
- **Share balík** — lokálne PDF alebo HTML-ZIP otvorené vo Finderi (vhodné na AirDrop; bez cloud hostingu)
- **Auto-sync** priečinka, ak dokumenty ležia v iCloud Drive / Dropboxe (tip pre viac Macov v Nastaveniach)
- Automatické ukladanie a **história verzií** s porovnaním diff

### Vzhľad a nastavenia
- Svetlá / tmavá / systémová téma + vlastné farby
- Náhodná generácia témy
- Konfigurovateľný priečinok dokumentov
- **Jazyk rozhrania:** slovenčina alebo angličtina (Nastavenia → Vzhľad → Jazyk)
- Voliteľný **MCP setup** v Nastaveniach (pre pokročilých)

## Tech stack

| Vrstva | Technológia |
|--------|-------------|
| Desktop shell | [Tauri 2](https://v2.tauri.app/) (Rust) + pluginy: dialog, fs, opener, [persisted-scope](https://v2.tauri.app/plugin/persisted-scope/), [positioner](https://v2.tauri.app/plugin/positioner/) |
| Frontend | React 19, TypeScript, Vite 8 |
| Editor | TipTap 3 (ProseMirror) |
| UI | Tailwind CSS v4, Radix UI, shadcn-style komponenty |
| Routing | TanStack Router |
| State | Redux Toolkit |
| i18n | i18next + react-i18next |
| Databáza | SQLite (rusqlite, WAL mode) |
| Lokálna AI | Python **3.10+** stdlib sidecar ([`nlp/`](nlp/)) — voliteľne `sentence-transformers` |
| Mobile (iOS/Android) | [`@tauri-apps/plugin-barcode-scanner`](https://v2.tauri.app/plugin/barcode-scanner/) — QR / čiarový kód → vložiť do poznámky |
| Testy | Vitest, Testing Library, `cargo test`, `nlp:test` |

## Požiadavky

- **macOS** (primárna cieľová platforma)
- [Bun](https://bun.sh/) alebo Node.js 20+
- [Rust](https://rustup.rs/) 1.77+
- Xcode Command Line Tools (pre Tauri build)
- **Python 3.10+** (`python3` v `PATH`) — len ak používate **Lokálnu AI**

## Spustenie

```bash
git clone <repo-url>
cd scribe
bun install
bun run tauri:dev
```

Alternatíva s npm:

```bash
npm install
npm run tauri:dev
```

Dev server beží na `http://localhost:5174`. Pri prvom spustení Tauri stiahne a skompiluje Rust závislosti — môže to trvať niekoľko minút.

## Skripty

| Príkaz | Popis |
|--------|-------|
| `bun run tauri:dev` | Spustí aplikáciu v dev režime (+ paralelne build MCP release binárky) |
| `bun run tauri:dev:debug` | To isté + Rust/NLP/frontend debug logy |
| `bun run tauri:dev:clean` | Dev režim s vyčisteným Vite cache |
| `bun run tauri:dev:app` | Len Tauri (bez MCP buildu) |
| `bun run tauri:dev:app:debug` | Len Tauri s debug env |
| `bun run tauri:build` | Produkčný build `.app` / inštalátora |
| `bun run build` | Len frontend build |
| `bun run dev` | Len Vite (prehliadač, bez Tauri IPC) |
| `bun run dev:debug` | Vite s `VITE_DEBUG=1` |
| `bun run test` | Frontend testy (Vitest) |
| `bun run test:backend` | Rust testy |
| `bun run test:all` | Frontend + Rust + NLP testy |
| `bun run lint` | ESLint |
| `npm run nlp:health` | Ping Lokálnej AI (JSON-RPC health) |
| `npm run nlp:debug` | Debug CLI Lokálnej AI (stderr timing + sample analyze) |
| `npm run nlp:test` | Python NLP unit testy |
| `npm run mcp:install` | Skompiluje Rust Scribe Memory MCP (`scribe-mcp`) |
| `npm run mcp` | Spustí MCP server (stdio, release) |
| `npm run mcp:debug` | MCP server (debug build + `RUST_LOG=debug`) |

## Lokálna AI (Python)

Voliteľná offline inteligencia. Zapnite v **Nastavenia → Lokálna AI**. Scribe spustí malý Python proces (`nlp/scribe_nlp/`) cez stdin/stdout JSON-RPC — text dokumentov **nikdy neopustí Mac**.

| | |
|--|--|
| **Runtime** | Python **3.10+**, predvolene len štandardná knižnica |
| **Verzia sidecaru** | **0.7.0** |
| **Predvolený embed model** | `scribe-hash-v4` (stem/diakritika; chunk mean-pool pre dlhé poznámky) |
| **Voliteľná kvalita** | `pip install sentence-transformers` → MiniLM (`scribe-minilm-v1`), cache v `~/.cache/scribe-nlp/models` |
| **Čo získate** | Sémantické ⌘K, AI prehľad (zhrnutie, tón, dátumy, odkazy, keywords), návrhy tagov, tón týždňa v denníku, analýza knižnice, AI zhrnutie diffu revízií |

```bash
# health check
npm run nlp:health

# unit testy (~50)
npm run nlp:test

# voliteľne lepšie embeddings
pip install 'sentence-transformers>=3'
# potom Nastavenia → Lokálna AI → quality backend + Preindexovať
```

Kompletný zoznam metód: [`nlp/README.md`](nlp/README.md). Po zmene modelu (napr. `v3` → `v4`) spustite **Preindexovať**.

## Debug režimy

| Vrstva | Príkaz / env | Čo dostanete |
|--------|--------------|--------------|
| Všetko | `npm run tauri:dev:debug` | Rust + NLP + Vite debug naraz |
| Frontend | `npm run dev:debug` alebo `VITE_DEBUG=1` | Console `[scribe-fe]` logy |
| Rust | `SCRIBE_RUST_LOG=debug` / `RUST_LOG=debug` / `SCRIBE_DEBUG=1` | Debug logy + NLP RPC stopy |
| NLP | `SCRIBE_NLP_DEBUG=1` alebo `npm run nlp:debug` | Sidecar stderr timing (stdout ostáva JSON-RPC) |
| MCP | `npm run mcp:debug` | Debug build `scribe-mcp` |

## Scribe Memory MCP (Claude / Cursor)

Voliteľná power funkcia: lokálne poznámky cez MCP pre Claude Desktop alebo Cursor. Bežné písanie MCP nevyžaduje. Server preferuje **zápis** (`create_note` / `append_to_note`) a pri zamknutej DB prejde do **read-only**. In-app: **Nastavenia → MCP**.

- Prehľad: [`crates/scribe-mcp/README.md`](crates/scribe-mcp/README.md) · docs [`crates/scribe-mcp/docs/`](crates/scribe-mcp/docs/README.md)

```bash
npm run mcp:install
npm run mcp
```

## Úložisko dát

Scribe ukladá dáta lokálne na disk:

| Čo | Kde (predvolene) |
|----|------------------|
| SQLite databáza | `~/Library/Application Support/com.scribe.app/scribe.db` |
| Dokumenty (`.scribe`) | `~/Documents/Scribe/` |
| Obrázky dokumentov | `~/Documents/Scribe/assets/` |
| PDF exporty | `~/Documents/Scribe/pdf/` |

Priečinok dokumentov je možné zmeniť v **Nastavenia → Úložisko**. Aplikácia neimplementuje viacužívateľské účty — izolácia je na úrovni macOS používateľa.

## Preklady (i18n)

Preklady sú v:

```
src/i18n/
├── index.ts          # nastavenie i18next
└── locales/
    ├── en.json       # angličtina
    └── sk.json       # slovenčina (predvolená)
```

Ako pridať alebo zmeniť texty:

1. Pridajte kľúč do `en.json` aj `sk.json`
2. V React komponentoch použite `useTranslation()`: `t('settings.language.title')`
3. Mimo React importujte `i18n` z `@/i18n` a volajte `i18n.t(...)`

Zvolený jazyk sa ukladá do IndexedDB (`scribe-locale`) a mení sa v **Nastavenia → Vzhľad → Jazyk**.

Zatiaľ nie je preložené celé UI — najprv nastavenia, navigácia, dialógy úložiska a skratky. Nové obrazovky by mali od začiatku používať prekladové kľúče.

## Klávesové skratky

| Skratka | Akcia |
|---------|-------|
| `⌘N` | Nový dokument (šablóny) |
| `⌘S` | Uložiť |
| `⌘K` | Príkazová paleta |
| `⌘O` | Importovať súbor |
| `⌘F` | Hľadať v dokumente |
| `⌘H` | Hľadať a nahradiť (aktuálny dokument) |
| `⌘⇧H` | Hľadať a nahradiť v knižnici |
| `⌘Z` / `⌘⇧Z` | Späť / Znovu |
| `⌘⇧F` | Režim sústredenia |
| `⌘⇧L` | Prepínať tému |
| `⌘,` | Nastavenia |
| `Esc` | Ukončiť režim sústredenia |

Kompletný zoznam je v aplikácii pod **Nastavenia → Skratky**.

## Štruktúra projektu

```
scribe/
├── src/                          # React frontend
│   ├── components/
│   │   ├── canvas/               # Canvas / whiteboard poznámky
│   │   ├── editor/               # Panely, menu, stránkovanie, diff
│   │   ├── editor-toolbar/       # Formátovací toolbar
│   │   ├── layout/               # AppHeader, SidebarRail, taby
│   │   ├── settings/             # Nastavenia UI
│   │   └── ui/                   # shadcn-style primitívy
│   ├── hooks/                    # Auto-save, hotkeys, pagination, …
│   ├── i18n/                     # Preklady (en, sk)
│   ├── layouts/                  # AppLayout, SettingsLayout
│   ├── lib/
│   │   ├── canvas/               # Helpery pre canvas dokumenty
│   │   ├── db/                   # Tauri invoke API
│   │   ├── editor/               # TipTap extensions a helpery
│   │   ├── export/               # HTML, PDF, DOCX, Markdown, share balíky
│   │   ├── revisions/            # Porovnanie verzií
│   │   └── themes/               # Témy a preset farby
│   ├── pages/                    # Home, Document, Settings
│   └── store/                    # Redux slices + persistence
├── src-tauri/                    # Rust backend
│   └── src/
│       ├── commands/             # Tauri commands (documents, folders, NLP, …)
│       ├── db/                   # SQLite, migrácie, FTS, revízie
│       ├── export/               # Export do súborov
│       └── storage/              # .scribe súbory, sync, persist queue
├── nlp/                          # Lokálna AI — Python sidecar (stdlib JSON-RPC)
│   ├── scribe_nlp/               # embed, summarize, analyze, NER, …
│   └── tests/                    # unittest (`npm run nlp:test`)
├── crates/scribe-core/           # Zdieľaný Rust DB / NLP most
├── crates/scribe-mcp/            # Voliteľný MCP server
└── src/__tests__/                # Vitest testy
```

## Vývoj

### Testy

```bash
bun run test          # 200+ frontend testov
bun run test:backend  # Rust unit testy (migrácie, export, storage)
npm run nlp:test      # Python testy Lokálnej AI
bun run test:all      # frontend + Rust + NLP
```

### Architektúra UI

Aplikácia používa trojstĺpcový shell:

```
Icon rail (52px) | Knižnica (252px) | Header + obsah
```

Editor obsahuje formátovací toolbar, taby dokumentov (s pinom), „papierový“ print-layout náhľad, pravý panel rail (štruktúra, komentáre, odkazy, štatistiky, história) a spodný status bar so stránkovaním a tlačou.

### Databázové migrácie

Schéma SQLite je verzovaná v `src-tauri/src/db/migrations.rs`. Pri štarte aplikácie sa migrácie aplikujú automaticky.

## Verzia

Aktuálna verzia: **1.3.0**
