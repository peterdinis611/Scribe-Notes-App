# scribe-ai

Pure AI **context packing**, **agent routing**, and **offline NLP fallbacks** for Scribe.

No SQLite, no Python sidecar process, no Tauri. Callers (Tauri / `scribe-core` / MCP) own retrieval and model I/O.

## Owns

| Area | Modules |
|------|---------|
| Context | `context`, `passages`, `types` (`RankedPassageChunk` + report DTOs) |
| Agent routing | `chat_intent`, `agent_slash`, `agent_phases` |
| Planning / tasks | `commitments`, `forward_plan`, `task_rank`, `open_loops` |
| Note extractors | `title`, `tone`, `quotes`, `decisions`, `mentions`, `pii`, `note_pulse` |
| Structure | `section_summaries`, `reading_plan`, `template_hints` |
| Offline UX | `placeholder`, `continuation` |

## Does not own

- Embedding / LLM inference → Python `nlp/scribe_nlp`
- Sidecar spawn / JSON-RPC → `scribe-core::nlp::NlpSidecar`
- Index jobs / vault / memory persistence / duplicates → `scribe-core::nlp`
- Sidecar JSON parsers (`parse.rs`) → `scribe-core::nlp` (uses these DTOs)
- Agent prefs DB → `scribe-agent`
- Revision diff AI → `scribe-core::nlp::revision_ai` (depends on `crate::diff`)

`scribe-core::nlp` re-exports this surface for compatibility.
