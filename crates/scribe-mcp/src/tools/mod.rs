//! MCP tool parameter types (split by domain).

mod agent_nlp;
mod documents;
mod library_ui;
mod study_files;
mod wiki;

pub use agent_nlp::*;
pub use documents::*;
pub use library_ui::*;
pub use study_files::*;
pub use wiki::*;

pub fn json<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|error| error.to_string())
}
