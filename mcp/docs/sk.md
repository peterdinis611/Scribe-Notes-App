# Scribe Memory MCP — dokumentácia (SK)

Lokálna knižnica **Scribe** ako pamäť pre **Claude Desktop** a **Cursor** cez [MCP](https://modelcontextprotocol.io/).

Server databázu **len číta**. Claude do Scribe nič nezapisuje — poznámky ostávajú zdrojom pravdy v aplikácii.

## Čo tým získate

- Claude / Cursor vie **vyhľadávať** vo vašich poznámkach
- Vie **načítať** celý dokument ako plain text do kontextu
- Vie sledovať **mapu prepojení** (`[[wiki odkazy]]`) — backlinky, odchádzajúce odkazy, celý graf

Nie je to oficiálne „Claude Memory“ v claude.ai. Je to **vlastná knowledge base** napojená cez MCP.

## Predpoklady

- macOS (Scribe je desktop app)
- Node.js **20+**
- Aspoň raz spustený Scribe (vytvorí sa DB)
- Cursor a/alebo Claude Desktop

Predvolená cesta k DB:

```text
~/Library/Application Support/com.scribe.app/scribe.db
```

## Inštalácia

Z koreňa repozitára Scribe:

```bash
npm run mcp:install
```

Alebo:

```bash
cd mcp
npm install
```

Overenie (stdio server ostane bežať a čakať — to je OK; ukončíte Ctrl+C):

```bash
npm run mcp
# alebo: cd mcp && npm start
```

V logu (stderr) by malo byť niečo ako: `Scribe memory MCP ready`.

## Pripojenie v Cursor

1. Otvorte nastavenia MCP v Cursor (alebo súbor `.cursor/mcp.json` v projekte / globálne).
2. Pridajte server — **absolútna cesta** k `mcp/`:

```json
{
  "mcpServers": {
    "scribe-memory": {
      "command": "npm",
      "args": ["run", "start", "--prefix", "/Users/VAS_USER/Desktop/práca/scribe/mcp"]
    }
  }
}
```

Príklad v repo: [`../cursor.mcp.example.json`](../cursor.mcp.example.json).

3. Obnovte MCP / reštartujte Cursor.
4. V chate overte: *„Zavolaj scribe_status“* alebo *„Hľadaj v mojich Scribe poznámkach …“*.

### Alternatíva po builde

```bash
cd mcp && npm run build
```

```json
{
  "mcpServers": {
    "scribe-memory": {
      "command": "node",
      "args": ["/Users/VAS_USER/Desktop/práca/scribe/mcp/dist/index.js"]
    }
  }
}
```

## Pripojenie v Claude Desktop

1. Otvorte / vytvorte:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

2. Vložte rovnaký blok `mcpServers.scribe-memory` ako vyššie.
3. Claude Desktop **úplne ukončite** (Cmd+Q) a znova spustite.
4. V novom chate skontrolujte dostupné MCP nástroje a skúste vyhľadávanie.

## Premenné prostredia

| Premenná | Význam |
|----------|--------|
| `SCRIBE_DB_PATH` | Absolútna cesta k `scribe.db`, ak nie je predvolená |

Príklad:

```bash
SCRIBE_DB_PATH="/cesta/k/scribe.db" npm start
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
| `search_documents` | Fulltext |
| `find_documents_by_title` | Titulok / wiki label |
| `get_document` | Celý text poznámky |
| `list_documents` | Zoznam nedávnych |
| `list_folders` | Priečinky |
| `list_backlinks` | Prichádzajúce odkazy |
| `list_outgoing_links` | Odchádzajúce odkazy |
| `list_link_graph` | Celá mapa |

## Riešenie problémov

| Problém | Čo skúsiť |
|---------|-----------|
| DB not found | Spustite Scribe raz; skontrolujte `SCRIBE_DB_PATH` |
| V Claude nie sú tools | Reštart Claude Desktop; validný JSON; absolútna cesta |
| Prázdne výsledky search | Uložte dokumenty v Scribe; FTS sa indexuje pri zápise |
| Zlá knižnica | Zavolajte `scribe_status` a skontrolujte `dbPath` |
| Chyba `better-sqlite3` | Node 20+, znova `npm install` v `mcp/` |
| Server „visí“ v termináli | Normálne pri stdio — čaká na klienta; ukončite Ctrl+C |

## Súkromie a bezpečnosť

- Všetko zostáva na vašom Macu  
- Pripojenie je lokálny proces (stdio), nie cloud API tohto servera  
- Režim SQLite je read-only  
- Do Claude chatu sa dostane len to, čo model **zámerne** načíta toolmi (a čo klient odošle do cloudu podľa svojich pravidiel)

## Vývoj

Zdrojáky:

```text
mcp/src/index.ts      # registrácia MCP toolov
mcp/src/db.ts         # SQL nad Scribe DB
mcp/src/plain-text.ts # TipTap JSON → plain text
```

```bash
cd mcp
npm run typecheck
npm run build
```

## Ďalšie odkazy

- [Prehľad balíka (EN README)](../README.md)
- [English guide](en.md)
- [Tool reference](tools.md)
- Mapa prepojení v aplikácii: route `/graph`
