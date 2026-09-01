# Scribe NLP sidecar

Optional **local** Python service for semantic search, journal summaries, tag suggestions, and library reports.

- **No cloud** — runs on your machine via stdio JSON-RPC
- **No pip dependencies** — Python 3.10+ stdlib only (`scribe-hash-v1` embeddings)
- **Rust stays the core** — Scribe spawns this process when NLP is enabled

## Dev

```bash
# health check (manual)
echo '{"jsonrpc":"2.0","id":1,"method":"health","params":{}}' | python3 nlp/scribe_nlp/__main__.py
```

From repo root, enable NLP in **Settings → Local AI** and use semantic search in ⌘K.

## Methods

| Method | Purpose |
|--------|---------|
| `health` | Sidecar status |
| `embed` | Single text → vector |
| `embed_batch` | Batch embeddings |
| `summarize` | Extractive summary |
| `extract_entities` | NER-lite + tag suggestions |
| `library_report` | Markdown library analysis |
