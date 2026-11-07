# scribe-ai

Pure AI **context packing**, **agent routing**, and **offline NLP fallbacks** for Scribe.

No SQLite, no Python sidecar process, no Tauri. Callers (Tauri / `scribe-core` / MCP) own retrieval and model I/O; this crate shapes prompts and provides Rust fallbacks when the Python sidecar is off.

## Owns

| Module | Role |
|--------|------|
| `context` | `ChatTurn`, merge chat memory, followups |
| `passages` | Full-note chunking + ranked Q&A passages |
| `types` | `RankedPassageChunk` |
| `chat_intent` | Document / agent intent matching |
| `agent_slash` | Slash catalog, parse, autocomplete |
| `agent_phases` | Multi-step plan phases |
| `commitments` | Commitment extraction |
| `forward_plan` | Next steps / agenda / upcoming |
| `task_rank` | Open-task ranking (`NlpRankedTask`) |
| `open_loops` | Tasks + commitments harvest |
| `tone` | Tone / readability pack |
| `placeholder` | Lorem / Slovak placeholder text |
| `continuation` | N-gram continue-writing suggestions |

## Does not own

- Embedding / LLM inference → Python `nlp/scribe_nlp`
- Sidecar spawn / JSON-RPC → `scribe-core::nlp::NlpSidecar`
- Index jobs / vault / memory persistence → `scribe-core::nlp`
- Agent prefs DB → `scribe-agent`
- Type-heavy extractors still in core (`title`, `pii`, `quotes`, `decisions`, `section_summaries`, …)

`scribe-core::nlp` re-exports this surface for compatibility.
