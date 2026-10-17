//! Shared audit event types and list/query filters.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    pub id: String,
    pub created_at: i64,
    /// `tauri` | `mcp` | `system`
    pub source: String,
    /// `agent` | `handoff` | `mcp_tool` | `prefs` | `security` | `nlp` | `admin` | `canvas` | `wiki` | `library`
    pub category: String,
    pub action: String,
    pub actor: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub summary: String,
    pub detail_json: Option<String>,
    /// `ok` | `error` | `denied`
    pub outcome: String,
}

#[derive(Debug, Clone, Default)]
pub struct AuditEventInput {
    pub source: String,
    pub category: String,
    pub action: String,
    pub actor: Option<String>,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub summary: String,
    pub detail: Option<Value>,
    pub outcome: Option<String>,
}

/// Filters for listing audit events (all fields optional).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditListQuery {
    pub limit: Option<usize>,
    pub category: Option<String>,
    pub source: Option<String>,
    pub outcome: Option<String>,
    /// Exact action match (normalized trim).
    pub action: Option<String>,
    /// Inclusive lower bound (`created_at` unix seconds).
    pub since: Option<i64>,
    /// Inclusive upper bound (`created_at` unix seconds).
    pub until: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuditCountBucket {
    pub key: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuditStats {
    pub total: u64,
    pub keep_limit: u64,
    pub oldest_at: Option<i64>,
    pub newest_at: Option<i64>,
    pub by_category: Vec<AuditCountBucket>,
    pub by_source: Vec<AuditCountBucket>,
    pub by_outcome: Vec<AuditCountBucket>,
}

pub fn normalize_source(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "mcp" => "mcp".into(),
        "system" => "system".into(),
        _ => "tauri".into(),
    }
}

pub fn normalize_category(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "handoff" => "handoff".into(),
        "mcp_tool" | "mcp-tool" | "tool" => "mcp_tool".into(),
        "prefs" | "preferences" => "prefs".into(),
        "security" => "security".into(),
        "nlp" => "nlp".into(),
        "admin" => "admin".into(),
        "canvas" => "canvas".into(),
        "wiki" => "wiki".into(),
        "library" | "sync" => "library".into(),
        _ => "agent".into(),
    }
}

pub fn normalize_outcome(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "error" | "fail" | "failed" => "error".into(),
        "denied" | "forbidden" => "denied".into(),
        _ => "ok".into(),
    }
}

pub fn normalize_action(raw: &str) -> String {
    raw.trim().chars().take(80).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_source_aliases() {
        assert_eq!(normalize_source("MCP"), "mcp");
        assert_eq!(normalize_source(" system "), "system");
        assert_eq!(normalize_source("desktop"), "tauri");
        assert_eq!(normalize_source(""), "tauri");
    }

    #[test]
    fn normalize_category_aliases() {
        assert_eq!(normalize_category("mcp-tool"), "mcp_tool");
        assert_eq!(normalize_category("tool"), "mcp_tool");
        assert_eq!(normalize_category("preferences"), "prefs");
        assert_eq!(normalize_category("sync"), "library");
        assert_eq!(normalize_category("unknown"), "agent");
        assert_eq!(normalize_category(" Wiki "), "wiki");
    }

    #[test]
    fn normalize_outcome_aliases() {
        assert_eq!(normalize_outcome("failed"), "error");
        assert_eq!(normalize_outcome("fail"), "error");
        assert_eq!(normalize_outcome("forbidden"), "denied");
        assert_eq!(normalize_outcome("ok"), "ok");
        assert_eq!(normalize_outcome("whatever"), "ok");
    }

    #[test]
    fn normalize_action_trims_and_truncates() {
        assert_eq!(normalize_action("  run  "), "run");
        let long = "a".repeat(100);
        assert_eq!(normalize_action(&long).len(), 80);
    }

    #[test]
    fn list_query_serde_camel_case() {
        let raw = r#"{"limit":10,"category":"agent","outcome":"error"}"#;
        let q: AuditListQuery = serde_json::from_str(raw).unwrap();
        assert_eq!(q.limit, Some(10));
        assert_eq!(q.category.as_deref(), Some("agent"));
        assert_eq!(q.outcome.as_deref(), Some("error"));
    }
}
