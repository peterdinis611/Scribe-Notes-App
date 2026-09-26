# scribe-agent

Local Agent store in its **own** SQLite file (`scribe-agent.db`), separate from the notes library (`scribe.db`).

## What’s stored

| Table | Purpose |
|--------|---------|
| `agent_prefs` | enabled, max steps, prefer-fast, preferred/disabled tools |
| `agent_teachings` | standing instructions the user taught the agent |
| `agent_runs` | recent goal/run log (capped) |

Document-scoped chat memory (`agent_messages`) stays in `scribe.db` because it FKs to documents.

## Usage

```rust
use scribe_agent::AgentStore;

let store = AgentStore::from_path(path)?;
let prefs = store.get_prefs()?;
store.add_teaching("Prefer Slovak answers")?;
```

Tauri opens the DB under the app data dir and exposes commands in `commands/agent.rs`.
