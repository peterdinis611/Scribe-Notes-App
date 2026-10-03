//! Scribe Local Agent store — own SQLite file (`scribe-agent.db`).
//!
//! Keeps agent prefs / teachings / run log out of the notes library database.

mod db;
mod grammar;
mod store;

pub use db::{open_agent_db, open_agent_db_memory, AgentDb, AGENT_DB_FILE, SCHEMA_VERSION};
pub use grammar::{grammar_rule_texts, memory_preamble, normalize_topic};
pub use store::{
    AgentPrefs, AgentRunRecord, AgentStore, AgentTeaching, DEFAULT_MAX_STEPS,
};
