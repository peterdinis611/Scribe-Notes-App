# Scribe

Moderná macOS desktopová aplikácia pre písanie a organizáciu dokumentov — lokálny rich-text editor s knižnicou, šablónami a exportom do viacerých formátov.

Scribe beží lokálne na vašom Macu. Žiadne účty, žiadny cloud — dokumenty, databáza a nastavenia patria používateľovi macOS účtu, v ktorom je aplikácia spustená.

**Jazyky:** [English](README.md) · [Slovenčina](README.sk.md)

## Funkcie

### Editor
- Rich-text editor postavený na **TipTap** / ProseMirror
- Prepínanie medzi formátovaným textom a **Markdown** zdrojákom
- Formátovanie: nadpisy, zoznamy, checklisty, tabuľky, obrázky, odkazy, poznámky pod čiarou
- Slash príkazy (`/`), bubble menu, drag & drop blokov a obrázkov
- Wiki odkazy (`[[dokument]]`), komentáre, matematika (KaTeX), code bloky (highlight.js)
- Náhľad tlače, rozloženie strán, hlavičky/päty, vodotlač, stránkovanie
- **Režim sústredenia** — minimal UI pre nerušené písanie (`⌘⇧F`, ukončenie cez `Esc`)

### Knižnica
- Stromová štruktúra **priečinkov** s drag & drop
- Fulltextové vyhľadávanie dokumentov (**SQLite FTS5**)
- Obľúbené, kôš, nedávne dokumenty
- Príkazová paleta (`⌘K`) pre rýchly prístup k dokumentom a akciám

### Dokumenty
- Vlastný formát **`.scribe`** + synchronizácia na disk
- Šablóny (report, list, životopis, faktúra, esej, …)
- Import: `.scribe`, `.pages`, `.md`, `.txt`, `.docx`, `.rtf`, `.doc`
- Export: **PDF**, **DOCX**, **Markdown**, **TXT**, **Pages**
- Automatické ukladanie a **história verzií** s porovnaním diff

### Vzhľad a nastavenia
- Svetlá / tmavá / systémová téma + vlastné farby
- Náhodná generácia témy
- Konfigurovateľný priečinok dokumentov
- **Jazyk rozhrania:** slovenčina alebo angličtina (Nastavenia → Vzhľad → Jazyk)

## Tech stack

| Vrstva | Technológia |
|--------|-------------|
| Desktop shell | [Tauri 2](https://v2.tauri.app/) (Rust) |
| Frontend | React 19, TypeScript, Vite 8 |
| Editor | TipTap 3 (ProseMirror) |
| UI | Tailwind CSS v4, Radix UI, shadcn-style komponenty |
| Routing | TanStack Router |
| State | Redux Toolkit |
| i18n | i18next + react-i18next |
| Databáza | SQLite (rusqlite, WAL mode) |
| Testy | Vitest, Testing Library, `cargo test` |

## Požiadavky

- **macOS** (primárna cieľová platforma)
- [Bun](https://bun.sh/) alebo Node.js 20+
- [Rust](https://rustup.rs/) 1.77+
- Xcode Command Line Tools (pre Tauri build)

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
| `bun run tauri:dev` | Spustí aplikáciu v dev režime |
| `bun run tauri:dev:clean` | Dev režim s vyčisteným Vite cache |
| `bun run tauri:build` | Produkčný build `.app` / inštalátora |
| `bun run build` | Len frontend build |
| `bun run test` | Frontend testy (Vitest) |
| `bun run test:backend` | Rust testy |
| `bun run test:all` | Oba test suites |
| `bun run lint` | ESLint |

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

Zvolený jazyk sa ukladá do `localStorage` (`scribe-locale`) a mení sa v **Nastavenia → Vzhľad → Jazyk**.

Zatiaľ nie je preložené celé UI — najprv nastavenia, navigácia, dialógy úložiska a skratky. Nové obrazovky by mali od začiatku používať prekladové kľúče.

## Klávesové skratky

| Skratka | Akcia |
|---------|-------|
| `⌘N` | Nový dokument (šablóny) |
| `⌘S` | Uložiť |
| `⌘K` | Príkazová paleta |
| `⌘O` | Importovať súbor |
| `⌘F` | Hľadať v dokumente |
| `⌘H` | Hľadať a nahradiť |
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
│   │   ├── editor/               # Panely, menu, stránkovanie, diff
│   │   ├── editor-toolbar/       # Formátovací toolbar
│   │   ├── layout/               # AppHeader, SidebarRail
│   │   ├── settings/             # Nastavenia UI
│   │   └── ui/                   # shadcn-style primitívy
│   ├── hooks/                    # Auto-save, hotkeys, pagination, …
│   ├── i18n/                     # Preklady (en, sk)
│   ├── layouts/                  # AppLayout, SettingsLayout
│   ├── lib/
│   │   ├── db/                   # Tauri invoke API
│   │   ├── editor/               # TipTap extensions a helpery
│   │   ├── export/               # HTML, PDF, DOCX, Markdown
│   │   ├── revisions/            # Porovnanie verzií
│   │   └── themes/               # Témy a preset farby
│   ├── pages/                    # Home, Document, Settings
│   └── store/                    # Redux slices + persistence
├── src-tauri/                    # Rust backend
│   └── src/
│       ├── commands/             # Tauri commands (documents, folders, …)
│       ├── db/                   # SQLite, migrácie, FTS, revízie
│       ├── export/               # Export do súborov
│       └── storage/              # .scribe súbory, sync, persist queue
└── src/__tests__/                # Vitest testy
```

## Vývoj

### Testy

```bash
bun run test          # 77+ frontend testov
bun run test:backend  # Rust unit testy (migrácie, export, storage)
```

### Architektúra UI

Aplikácia používa trojstĺpcový shell:

```
Icon rail (52px) | Knižnica (252px) | Header + obsah
```

Editor obsahuje formátovací toolbar, plátno s „papierovým“ náhľadom, pravý panel rail (štruktúra, komentáre, odkazy, štatistiky, história) a spodný status bar so stránkovaním a tlačou.

### Databázové migrácie

Schéma SQLite je verzovaná v `src-tauri/src/db/migrations.rs`. Pri štarte aplikácie sa migrácie aplikujú automaticky.

## Verzia

Aktuálna verzia: **0.4.0**
