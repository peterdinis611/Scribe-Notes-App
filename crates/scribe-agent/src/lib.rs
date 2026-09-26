//! Scribe Local Agent store — own SQLite file (`scribe-agent.db`).
//!
//! Keeps agent prefs / teachings / run log out of the notes library database.

mod db;
mod store;

pub use db::{open_agent_db, open_agent_db_memory, AgentDb, AGENT_DB_FILE, SCHEMA_VERSION};
pub use store::{
    AgentPrefs, AgentRunRecord, AgentStore, AgentTeaching, DEFAULT_MAX_STEPS,
};
