# Scribe NLP sidecar

Optional **local** Python service for semantic search, journal summaries, tag suggestions, and library reports.

## Čo znamená „Lokálna AI“ v Scribe?

**Nie je to** ChatGPT, cloud API ani online chatbot.

**Je to** malý Python proces, ktorý Scribe spustí na vašom Macu, keď zapnete **Nastavenia → Lokálna AI**. Komunikuje s aplikáciou cez stdin/stdout (JSON-RPC) — text dokumentov **nikdy neopustí počítač**.

### Požiadavky

- Python **3.10+**
- **Žiadne povinné pip závislosti** (stdlib-first)
- Voliteľné extras (soft-import — bez nich funguje fallback):

```bash
cd nlp
pip install -e '.[enhance,onnx,faiss]'               # denné používanie (odporúčané)
pip install -e '.[fast-embed]'                       # Model2Vec stredná cesta hash ↔ MiniLM
pip install -e '.[lexical]'                          # bm25s hybrid lexical ranking
pip install -e '.[hnsw]'                             # pynear HNSW (veľké knižnice)
pip install -e '.[quality]'                          # MiniLM (sentence-transformers)
pip install -e '.[translate]'                        # argostranslate (SK↔EN)
pip install -e '.[ner]' && python -m spacy download xx_ent_wiki_sm
pip install -e '.[full]'                             # všetko vyššie
```

- Po upgrade modelu / zmene backendu (`hash` → `fast`/`quality`) spustite **Preindexovať**
- Stav balíčkov: **Nastavenia → Lokálna AI** (chipy extras)

## Models

| Model | Description |
|-------|-------------|
| `scribe-hash-v3` | Stopword-aware + lead boost |
| `scribe-hash-v4` | + stem/diacritic features, chunk mean-pool for long docs (current hash) |
| `scribe-m2v-v1` | Optional Model2Vec static embeddings (`fast` backend) |
| `scribe-minilm-v1` | Optional quality MiniLM via sentence-transformers |
| `scribe-minilm-onnx-v1` | Same MiniLM via onnxruntime (preferred when ONNX assets are cached) |

## Optional package wiring

| Extra | Improves |
|-------|----------|
| rapidfuzz | Spell suggestions, wiki title fuzzy match |
| lingua | SK/EN language detection |
| ftfy | Mojibake / broken Unicode repair on ingest |
| dateparser | Free-form due dates (`zajtra`, `next Friday`) |
| argostranslate | Offline rewrite translate_sk / translate_en |
| spacy (+ `xx_ent_wiki_sm`) | NER people/orgs/places → tags & Insights |
| onnxruntime | Faster quality embeddings without full PyTorch load path |
| faiss-cpu | Similar-notes shortlist (flat IP) |
| model2vec | Fast static embeddings (`fast` backend) between hash and MiniLM |
| bm25s | Lexical BM25 boost in similar notes + library_answer rerank |
| pynear | HNSW cosine ANN when candidate set ≥ 128 (falls back to FAISS) |

## Dev

```bash
npm run nlp:health
npm run nlp:test
npm run nlp:debug   # SCRIBE_NLP_DEBUG=1 sample RPCs + timings on stderr
```

Set `SCRIBE_NLP_DEBUG=1` (or `SCRIBE_DEBUG=1` via Tauri) to log each RPC to stderr without breaking JSON-RPC on stdout.

## Methods

Core: `health`, `embed`, `embed_batch`, `summarize`, `extract_*`, `analyze_document`, `similar_notes`, `library_report`

0.6+: `reading_stats`, `find_duplicates`, `suggest_title`, `extract_mentions`, `analyze_sentiment`, `extract_dates`, `summarize_diff`, `template_fill_hints`

0.7+: `chunk_text`, `rewrite_query` · keywords use KeyBERT-lite when quality backend is on

0.8+: `spellcheck` — offline SK/EN typo check (EN wordlist + SK Hunspell dic/aff, edit-distance suggestions)

0.8.1+: MiniLM `embed_batch` is a real ST encode (reindex / duplicates / similar / KeyBERT); device auto-detect (CUDA/MPS/CPU); index syncs quality backend before encode

0.9+: `library_answer` (library + document scope), `suggest_wiki_links`, `suggest_organize`, `extract_dates_batch` (calendar)

0.9.2+: stem-aware answer ranking + heuristic `followups` on `library_answer`

1.0.0: `library_answer` passes `chunkIndex` through to citations

1.0.1+: question intent detection (dates/tasks/people/decisions/…) boosts ranking + labeled answers + richer follow-ups

1.0.2+: document Q&A loads full note text (OCR included), merges embeddings with whole-document coverage

1.1.0+: `suggest_continuation` — local n-gram continue-writing from library corpus (slash `/continue`)

1.2.0+: `analyze_revision_diff` — dedicated revision AI (change kind, risks, bullets; Rust fallback)

1.3.0+: `extract_flashcards`, `check_terminology`, `extract_takeaways`, `writing_coach`

## Version

Current sidecar: **1.3.0**
