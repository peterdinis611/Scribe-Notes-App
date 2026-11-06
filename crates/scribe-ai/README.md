# scribe-ai

Pure AI **context packing** for Scribe: chat turns, document passages, and prompt budgets.

No SQLite, no Python sidecar process, no Tauri. Callers (Tauri / `scribe-core` / MCP) own retrieval and model I/O; this crate shapes what gets sent to the model.

## Owns

| Module | Role |
|--------|------|
| `context` | `ChatTurn`, merge chat memory into passage lists, followups from sidecar JSON |
| `passages` | Chunk full-note text, build ranked Q&A passage lists |
| `types` | `RankedPassageChunk` DTO (host maps DB hits into this) |

## Does not own

- Embedding / LLM inference → Python `nlp/scribe_nlp`
- Sidecar spawn / JSON-RPC → `scribe-core::nlp::NlpSidecar`
- Index jobs / vault index / memory persistence → `scribe-core::nlp`
- Agent prefs / teachings DB → `scribe-agent`

## API

- `ChatTurn` / `merge_chat_memory_passages` / `followups_from_sidecar`
- `chunk_document_passages` / `build_document_answer_passages`
- `RankedPassageChunk`
- Budget constants (`DOCUMENT_CHAT_CONTEXT_LIMIT`, `DOCUMENT_ANSWER_PASSAGE_LIMIT`, …)

`scribe-core::nlp` re-exports this surface so existing `use scribe_core::nlp::…` keeps working.
