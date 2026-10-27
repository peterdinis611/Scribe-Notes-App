//! Scribe Local Agent store — own SQLite file (`scribe-agent.db`).
//!
//! Keeps agent prefs / teachings / run log out of the notes library database.

mod db;
mod digest;
mod grammar;
mod handoffs;
mod optimize;
mod roles;
mod store;

pub use db::{open_agent_db, open_agent_db_memory, AgentDb, AGENT_DB_FILE, SCHEMA_VERSION};
pub use digest::{should_catch_up_digest, should_run_digest_now};
pub use grammar::{grammar_rule_texts, memory_preamble, normalize_topic};
pub use handoffs::{
    default_handoff_target, inbox_preamble, parse_handoff_goal, AgentHandoff, ParsedHandoffGoal,
};
pub use optimize::{
    apply_agent_optimize, can_run_agent_budget, is_heavy_agent_tool, is_quiet_hour_now,
    OptimizePrefs, HEAVY_TOOLS,
};
pub use roles::{normalize_agent_id, AGENT_ROLE_IDS, DEFAULT_AGENT_ID};
pub use store::{
    AgentDigestSchedule, AgentPrefs, AgentRoleState, AgentRunRecord, AgentStore, AgentTeaching,
    CustomAgentRecipe, CUSTOM_RECIPES_MAX, DEFAULT_MAX_STEPS,
};
