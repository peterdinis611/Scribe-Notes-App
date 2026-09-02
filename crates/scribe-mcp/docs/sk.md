# Scribe Memory MCP — dokumentácia (SK)

Lokálna knižnica **Scribe** ako pamäť pre **Claude Desktop** a **Cursor** cez [MCP](https://modelcontextprotocol.io/).

Server sa snaží otvoriť DB **na zápis** (nástroje `create_note` / `append_to_note`). Ak je DB zamknutá (napr. beží Scribe), prepne sa do **read-only**.

## Čo tým získate

- Claude / Cursor vie **vyhľadávať** vo vašich poznámkach
- Vie **načítať** celý dokument ako plain text do kontextu
- Vie sledovať **mapu prepojení** (`[[wiki odkazy]]`) — backlinky, odchádzajúce odkazy, celý graf

Nie je to oficiálne „Claude Memory“ v claude.ai. Je to **vlastná knowledge base** napojená cez MCP.

## Predpoklady

- macOS (Scribe je desktop app)
- Rust toolchain (`cargo`; cez Xcode CLI tools alebo rustup)
- Aspoň raz spustený Scribe (vytvorí sa DB)
- Cursor a/alebo Claude Desktop
- Voliteľné: Python 3 + NLP deps pre sémantické nástroje (Lokálne AI v nastaveniach Scribe)

Predvolená cesta k DB:

```text
~/Library/Application Support/com.scribe.app/scribe.db
```

## Inštalácia

Z koreňa repozitára Scribe:

```bash
npm run mcp:install
```

Vytvorí sa binárka `target/release/scribe-mcp`.

Overenie (stdio server ostane bežať a čakať — to je OK; ukončíte Ctrl+C):

```bash
npm run mcp
```

## Pripojenie v Cursor

1. Otvorte nastavenia MCP v Cursor (alebo súbor `.cursor/mcp.json` v projekte / globálne).
2. Pridajte server — **absolútna cesta** k binárke:

```json
{
  "mcpServers": {
    "scribe-memory": {
      "command": "/Users/VAS_USER/Desktop/práca/scribe/target/release/scribe-mcp",
      "args": []
    }
  }
}
```

Príklad v repo: [`../cursor.mcp.example.json`](../cursor.mcp.example.json).

3. Obnovte MCP / reštartujte Cursor.
4. V chate overte: *„Zavolaj scribe_status“* alebo *„Hľadaj v mojich Scribe poznámkach …“*.

## Pripojenie v Claude Desktop

1. Otvorte / vytvorte:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

2. Vložte rovnaký blok `mcpServers.scribe-memory` ako vyššie.
3. Claude Desktop **úplne ukončite** (Cmd+Q) a znova spustite.
4. V novom chate skontrolujte dostupné MCP nástroje a skúste vyhľadávanie.

## Write tools

- **`create_note`** — nová poznámka (`title`, voliteľne `content`, `folderId`)
- **`append_to_note`** — doplnenie textu do existujúcej poznámky (`id`, `text`)

**Upozornenie:** bežiaca aplikácia Scribe môže DB zamknúť. Pri chybe „locked / busy“ alebo `writable: false` v `scribe_status` skúste znova o chvíľu (alebo dočasne zatvorte Scribe). Force readonly: `SCRIBE_MCP_WRITE=0`.

## Premenné prostredia

| Premenná | Význam |
|----------|--------|
| `SCRIBE_DB_PATH` | Absolútna cesta k `scribe.db`, ak nie je predvolená |
| `SCRIBE_MCP_WRITE` | `0` = vynútiť read-only |
| `SCRIBE_NLP_SCRIPT` | Cesta k Python NLP `__main__.py` pre sémantické nástroje |
| `SCRIBE_NLP_PYTHON` | Python binárka (predvolene `python3`) |

Príklad:

```bash
SCRIBE_DB_PATH="/cesta/k/scribe.db" target/release/scribe-mcp
```

V Cursor / Claude configu môžete pridať:

```json
"env": {
  "SCRIBE_DB_PATH": "/cesta/k/scribe.db"
}
```

## Ako to používať (workflow)

Odporúčané poradie pre model:

1. **`search_documents`** — nájsť relevantné poznámky podľa kľúčových slov  
2. alebo **`find_documents_by_title`** — keď poznáte názov / `[[Názov]]`  
3. **`get_document`** — načítať plain text do kontextu  
4. **`list_backlinks` / `list_outgoing_links` / `list_link_graph`** — ísť po mape prepojení  

### Príklady promptov

- „Pozri sa do mojej Scribe knižnice a zhrň, čo mám o X.“
- „Nájdi dokument s názvom podobným ‚report‘ a prečítaj ho.“
- „Ukáž mapu wiki odkazov a ktoré poznámky sú osirolené.“
- „Čo odkazuje na dokument s id …?“

### Ako pripraviť knižnicu v Scribe

- Píšte poznámky normálne v aplikácii  
- Prepojujte ich cez `[[Názov dokumentu]]`  
- Použite **Mapu prepojení** v Scribe (`/graph`), aby ste videli rovnakú sieť, akú MCP vracia cez `list_link_graph`

## Nástroje

Prehľad argumentov a príkladov: **[tools.md](tools.md)**.

| Nástroj | Účel |
|---------|------|
| `scribe_status` | Kontrola DB |
| `search_documents` | Hybrid FTS + sémantika (ak je Lokálne AI zapnuté) |
| `search` | Jednotné vyhľadávanie s `mode` |
| `search_documents_fts` | Len fulltext |
| `semantic_search` | Vyhľadávanie cez embeddingy |
| `similar_documents` | Podobné poznámky |
| `extract_document_tasks` | Otvorené úlohy z poznámky |
| `journal_tasks` | Úlohy z viacerých denníkových záznamov |
| `journal_summary` | AI zhrnutie denníka |
| `suggest_tags` | Návrhy tagov |
| `library_report` | AI prehľad knižnice |
| `index_document` / `index_all_documents` | Index embeddingov |
| `nlp_status` | Stav NLP sidecaru |
| `trash_document` / `rename_document` / `replace_document_content` | Úpravy poznámok |
| `set_document_favorite` / `set_document_pinned` | Príznaky |
| `find_documents_by_title` | Titulok / wiki label |
| `get_document` | Celý text poznámky |
| `list_documents` | Zoznam nedávnych |
| `list_folders` | Priečinky |
| `list_backlinks` | Prichádzajúce odkazy |
| `list_outgoing_links` | Odchádzajúce odkazy |
| `list_link_graph` | Celá mapa |
| `create_note` | Nová poznámka (zápis) |
| `append_to_note` | Doplnenie textu (zápis) |

## Riešenie problémov

| Problém | Čo skúsiť |
|---------|-----------|
| DB not found | Spustite Scribe raz; skontrolujte `SCRIBE_DB_PATH` |
| V Claude nie sú tools | Reštart Claude Desktop; validný JSON; absolútna cesta |
| Prázdne výsledky search | Uložte dokumenty v Scribe; FTS sa indexuje pri zápise |
| Zlá knižnica | Zavolajte `scribe_status` a skontrolujte `dbPath` |
| Build zlyhá | Spustite `cargo build --release -p scribe-mcp` z koreňa repa |
| Sémantické nástroje prázdne | Zapnite Lokálne AI v Scribe; počkajte na indexáciu |
| Server „visí“ v termináli | Normálne pri stdio — čaká na klienta; ukončite Ctrl+C |
| Zápis zlyhá / `writable: false` | Scribe môže držať zámok — retry; skontrolujte `SCRIBE_MCP_WRITE` |

## Súkromie a bezpečnosť

- Všetko zostáva na vašom Macu  
- Pripojenie je lokálny proces (stdio), nie cloud API tohto servera  
- Zápis len keď je DB otvorená writable; inak read-only  
- Do Claude chatu sa dostane len to, čo model **zámerne** načíta toolmi (a čo klient odošle do cloudu podľa svojich pravidiel)

## Vývoj

Zdrojáky:

```text
crates/scribe-mcp/src/   # MCP server (rmcp stdio)
crates/scribe-core/src/  # zdieľaná DB, store, NLP bridge
```

```bash
cargo build --release -p scribe-mcp
cargo test -p scribe-mcp
```

## Ďalšie odkazy

- [Prehľad balíka](../README.md)
- [English guide](en.md)
- [Tool reference](tools.md)
- Mapa prepojení v aplikácii: route `/graph`
