# Scribe NLP sidecar

Optional **local** Python service for semantic search, journal summaries, tag suggestions, and library reports.

## Čo znamená „Lokálna AI“ v Scribe?

**Nie je to** ChatGPT, cloud API ani online chatbot.

**Je to** malý Python proces, ktorý Scribe spustí na vašom Macu, keď zapnete **Nastavenia → Lokálna AI**. Komunikuje s aplikáciou cez stdin/stdout (JSON-RPC) — text dokumentov **nikdy neopustí počítač**.

### Požiadavky

- Python **3.10+**
- **Žiadne pip závislosti** (voliteľne `pip install 'scribe-nlp[quality]'` / `sentence-transformers`)
- Po upgrade modelu (`v3` → `v4`) spustite **Preindexovať**

## Models

| Model | Description |
|-------|-------------|
| `scribe-hash-v3` | Stopword-aware + lead boost |
| `scribe-hash-v4` | + stem/diacritic features, chunk mean-pool for long docs (current) |
| `scribe-minilm-v1` | Optional quality MiniLM (disk cache in `~/.cache/scribe-nlp/models`) |

## Dev

```bash
npm run nlp:health
npm run nlp:test
```

## Methods (0.7)

Core: `health`, `embed`, `embed_batch`, `summarize`, `extract_*`, `analyze_document`, `similar_notes`, `library_report`

0.6+: `reading_stats`, `find_duplicates`, `suggest_title`, `extract_mentions`, `analyze_sentiment`, `extract_dates`, `summarize_diff`, `template_fill_hints`

0.7+: `chunk_text`, `rewrite_query` · keywords use KeyBERT-lite when quality backend is on

## Version

Current sidecar: **0.7.0**
