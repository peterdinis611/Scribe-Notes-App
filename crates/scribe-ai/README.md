# scribe-ai

Pure AI helpers for Scribe: context packing, agent routing, offline NLP fallbacks, prompts, and scoring.

No SQLite, no Python sidecar process, no Tauri.

## Owns

| Area | Modules |
|------|---------|
| Context | `context`, `passages`, `budget`, `types` |
| Agent | `chat_intent`, `agent_slash`, `agent_phases`, `tool_plan` |
| Extractors | `title`, `tone`, `quotes`, `decisions`, `mentions`, `pii`, `note_pulse`, `commitments`, `forward_plan`, `task_rank`, `open_loops`, `section_summaries`, `reading_plan`, `template_hints` |
| Offline UX | `placeholder`, `continuation`, `revision_ai`, `query_rewrite` |
| Retrieval helpers | `citation_pack`, `duplicates` + `vectors`, `prompts` |

## Does not own

- Sidecar / seatbelt / index jobs / memory / vault index → `scribe-core::nlp`
- Embeddings storage & FTS → `scribe-core` DB
- Agent prefs SQLite → `scribe-agent`
- Model inference → Python `nlp/scribe_nlp`

`scribe-core::nlp` re-exports this surface for compatibility.
