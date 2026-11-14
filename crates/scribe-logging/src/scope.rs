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
    SCOPES.contains(&t) || t.starts_with("scribe.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_all_builtin_scopes() {
        let scopes = list_scopes();
        assert_eq!(scopes.len(), SCOPES.len());
        assert!(scopes.iter().any(|s| s.id == "scribe.logging"));
        assert!(scopes.iter().any(|s| s.id == "scribe.fe.diagnostics"));
        let logging = scopes.iter().find(|s| s.id == "scribe.logging").unwrap();
        assert_eq!(logging.label, "logging");
        let fe_ipc = scopes.iter().find(|s| s.id == "scribe.fe.ipc").unwrap();
        assert_eq!(fe_ipc.label, "fe · ipc");
    }

    #[test]
    fn known_scope_detection() {
        assert!(is_known_scope("scribe.db"));
        assert!(is_known_scope("  scribe.fe.boot  "));
        assert!(is_known_scope("scribe.custom.plugin"));
        assert!(!is_known_scope("tao"));
        assert!(!is_known_scope(""));
        assert!(!is_known_scope("hyper"));
    }

    #[test]
    fn scopes_are_unique() {
        let mut seen = std::collections::HashSet::new();
        for id in SCOPES {
            assert!(seen.insert(*id), "duplicate scope {id}");
        }
    }
}
