# Scribe NLP sidecar

Optional **local** Python service for semantic search, journal summaries, tag suggestions, and library reports.

## Čo znamená „Lokálna AI“ v Scribe?

**Nie je to** ChatGPT, cloud API ani online chatbot.

**Je to** malý Python proces, ktorý Scribe spustí na vašom Macu, keď zapnete **Nastavenia → Lokálna AI**. Komunikuje s aplikáciou cez stdin/stdout (JSON-RPC) — text dokumentov **nikdy neopustí počítač**.

| Vrstva | Čo robí |
|--------|---------|
| **Rust jadro** | Editor, SQLite databáza, fulltext (FTS), ukladanie, export — funguje vždy |
| **Python sidecar** | Embeddings, sémantické vyhľadávanie, sumarizácia, NER, analýza knižnice — voliteľné |

### Čo získate po zapnutí

- **Sémantické vyhľadávanie** v ⌘K (scope „Sémanticky“ alebo hybrid v „Všetko“)
- **Návrhy tagov** v kontextovom menu dokumentu
- **Týždenný prehľad denníka** (Library → Journal)
- **Analýza knižnice** v Nastaveniach → Lokálna AI

### Požiadavky

- Python **3.10+** (`python3` v PATH)
- **Žiadne pip závislosti** — len štandardná knižnica Pythonu
- Po upgrade modelu (`scribe-hash-v1` → `v2`) spustite **Preindexovať**

## Models

| Model | Description |
|-------|-------------|
| `scribe-hash-v1` | Legacy word-hash embeddings |
| `scribe-hash-v2` | Word + bigram + char n-gram features (current) |

## Dev

```bash
# health check
npm run nlp:health

# unit tests
npm run nlp:test
```

## Methods

| Method | Purpose |
|--------|---------|
| `health` | Sidecar status + limits |
| `embed` | Single text → vector (LRU cached) |
| `embed_batch` | Batch embeddings (max 128) |
| `summarize` | Extractive summary with MMR diversity |
| `extract_entities` | NER-lite: email, URL, phone, dates, wiki links, hashtags |
| `library_report` | Markdown library analysis |

## Limits

- Text inputs: 120 000 characters
- Embed batch: 128 texts
- Library report: 5 000 documents
