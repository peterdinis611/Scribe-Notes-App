//! Well-known Scribe log targets / scopes.

use serde::{Deserialize, Serialize};

/// Built-in scopes used by host + FE (keep in sync with `src/lib/logging`).
pub const SCOPES: &[&str] = &[
    "scribe.logging",
    "scribe.boot",
    "scribe.db",
    "scribe.storage",
    "scribe.nlp",
    "scribe.agent",
    "scribe.ws",
    "scribe.capture",
    "scribe.audit",
    "scribe.fe",
    "scribe.fe.boot",
    "scribe.fe.ipc",
    "scribe.fe.save",
    "scribe.fe.sync",
    "scribe.fe.router",
    "scribe.fe.plugins",
    "scribe.fe.toast",
    "scribe.fe.diagnostics",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogScopeInfo {
    pub id: String,
    pub label: String,
}

pub fn list_scopes() -> Vec<LogScopeInfo> {
    SCOPES
        .iter()
        .map(|id| LogScopeInfo {
            id: (*id).to_string(),
            label: id
                .strip_prefix("scribe.")
                .unwrap_or(id)
                .replace('.', " · "),
        })
        .collect()
}

pub fn is_known_scope(target: &str) -> bool {
    let t = target.trim();
    SCOPES.iter().any(|s| *s == t) || t.starts_with("scribe.")
}
