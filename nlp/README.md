# Scribe NLP sidecar

Optional **local** Python service for semantic search, journal summaries, tag suggestions, and library reports.

- **No cloud** — runs on your machine via stdio JSON-RPC
- **No pip dependencies** — Python 3.10+ stdlib only
- **Rust stays the core** — Scribe spawns this process when NLP is enabled

## Models

| Model | Description |
|-------|-------------|
| `scribe-hash-v1` | Legacy word-hash embeddings (pre-0.2.0) |
| `scribe-hash-v2` | Word + bigram + character n-gram features (current) |

After upgrading, run **Reindex all** in Settings → Local AI so semantic search uses the new model.

## Dev

```bash
# health check
npm run nlp:health

# unit tests
npm run nlp:test
```

From repo root, enable NLP in **Settings → Local AI** and use semantic search in ⌘K.

## Methods

| Method | Purpose |
|--------|---------|
| `health` | Sidecar status + limits |
| `embed` | Single text → vector (LRU cached) |
| `embed_batch` | Batch embeddings (max 128) |
| `summarize` | Extractive summary with MMR diversity |
| `extract_entities` | NER-lite: email, URL, phone, dates, wiki links, hashtags |
| `library_report` | Markdown library analysis (SK labels) |

## Limits

- Text inputs: 120 000 characters
- Embed batch: 128 texts
- Library report: 5 000 documents
