//! Shared audit event types and list/query filters.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Origin of an audit event.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditSource {
    Tauri,
    Mcp,
    System,
}

impl AuditSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Tauri => "tauri",
            Self::Mcp => "mcp",
            Self::System => "system",
        }
    }

    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "mcp" => Self::Mcp,
            "system" => Self::System,
            _ => Self::Tauri,
        }
    }
}

impl std::fmt::Display for AuditSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// High-level audit category.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditCategory {
    Agent,
    Handoff,
    McpTool,
    Prefs,
    Security,
    Nlp,
    Admin,
    Canvas,
    Wiki,
    Library,
}

impl AuditCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Agent => "agent",
            Self::Handoff => "handoff",
            Self::McpTool => "mcp_tool",
            Self::Prefs => "prefs",
            Self::Security => "security",
            Self::Nlp => "nlp",
            Self::Admin => "admin",
            Self::Canvas => "canvas",
            Self::Wiki => "wiki",
            Self::Library => "library",
        }
    }

    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "handoff" => Self::Handoff,
            "mcp_tool" | "mcp-tool" | "tool" => Self::McpTool,
            "prefs" | "preferences" => Self::Prefs,
            "security" => Self::Security,
            "nlp" => Self::Nlp,
            "admin" => Self::Admin,
            "canvas" => Self::Canvas,
            "wiki" => Self::Wiki,
            "library" | "sync" => Self::Library,
            _ => Self::Agent,
        }
    }
}

impl std::fmt::Display for AuditCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Result of the audited action.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditOutcome {
    Ok,
    Error,
    Denied,
}

impl AuditOutcome {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ok => "ok",
            Self::Error => "error",
            Self::Denied => "denied",
        }
    }

    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "error" | "fail" | "failed" => Self::Error,
            "denied" | "forbidden" => Self::Denied,
            _ => Self::Ok,
        }
    }
}

impl std::fmt::Display for AuditOutcome {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    pub id: String,
    pub created_at: i64,
    pub source: AuditSource,
    pub category: AuditCategory,
    pub action: String,
    pub actor: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub summary: String,
    pub detail_json: Option<String>,
    pub outcome: AuditOutcome,
    pub correlation_id: Option<String>,
    pub session_id: Option<String>,
    pub app_version: Option<String>,
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
    pub correlation_id: Option<String>,
    pub session_id: Option<String>,
    pub app_version: Option<String>,
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
    /// Exact actor match (trim).
    pub actor: Option<String>,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    /// Substring match against `summary` (trim, max 80 chars).
    pub q: Option<String>,
    /// Exact correlation id match.
    pub correlation_id: Option<String>,
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
    pub by_action: Vec<AuditCountBucket>,
    pub by_actor: Vec<AuditCountBucket>,
}

pub fn normalize_source(raw: &str) -> String {
    AuditSource::parse(raw).as_str().into()
}

pub fn normalize_category(raw: &str) -> String {
    AuditCategory::parse(raw).as_str().into()
}

pub fn normalize_outcome(raw: &str) -> String {
    AuditOutcome::parse(raw).as_str().into()
}

pub fn normalize_action(raw: &str) -> String {
    raw.trim().chars().take(80).collect()
}

/// Escape `%`, `_`, and `\` for SQLite `LIKE … ESCAPE '\'`.
pub fn escape_like_pattern(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        match ch {
            '\\' | '%' | '_' => {
                out.push('\\');
                out.push(ch);
            }
            _ => out.push(ch),
        }
    }
    out
}

/// Trim + cap search text used for summary substring filter.
pub fn normalize_search_q(raw: &str) -> String {
    raw.trim().chars().take(80).collect()
}

pub fn normalize_optional_id(raw: Option<String>, max_chars: usize) -> Option<String> {
    raw.map(|value| value.trim().chars().take(max_chars).collect())
        .filter(|value: &String| !value.is_empty())
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
        assert_eq!(AuditSource::parse("MCP"), AuditSource::Mcp);
    }

    #[test]
    fn normalize_category_aliases() {
        assert_eq!(normalize_category("mcp-tool"), "mcp_tool");
        assert_eq!(normalize_category("tool"), "mcp_tool");
        assert_eq!(normalize_category("preferences"), "prefs");
        assert_eq!(normalize_category("sync"), "library");
        assert_eq!(normalize_category("unknown"), "agent");
        assert_eq!(normalize_category(" Wiki "), "wiki");
        assert_eq!(AuditCategory::parse("mcp-tool"), AuditCategory::McpTool);
    }

    #[test]
    fn normalize_outcome_aliases() {
        assert_eq!(normalize_outcome("failed"), "error");
        assert_eq!(normalize_outcome("fail"), "error");
        assert_eq!(normalize_outcome("forbidden"), "denied");
        assert_eq!(normalize_outcome("ok"), "ok");
        assert_eq!(normalize_outcome("whatever"), "ok");
        assert_eq!(AuditOutcome::parse("forbidden"), AuditOutcome::Denied);
    }

    #[test]
    fn normalize_action_trims_and_truncates() {
        assert_eq!(normalize_action("  run  "), "run");
        let long = "a".repeat(100);
        assert_eq!(normalize_action(&long).len(), 80);
    }

    #[test]
    fn escape_like_and_search_q() {
        assert_eq!(escape_like_pattern(r"a%b_c\d"), r"a\%b\_c\\d");
        assert_eq!(normalize_search_q("  hello  "), "hello");
        assert_eq!(normalize_search_q(&"x".repeat(100)).len(), 80);
    }

    #[test]
    fn enum_serde_snake_case() {
        assert_eq!(
            serde_json::to_string(&AuditSource::Mcp).unwrap(),
            "\"mcp\""
        );
        assert_eq!(
            serde_json::to_string(&AuditCategory::McpTool).unwrap(),
            "\"mcp_tool\""
        );
        assert_eq!(
            serde_json::to_string(&AuditOutcome::Denied).unwrap(),
            "\"denied\""
        );
    }

    #[test]
    fn list_query_serde_camel_case() {
        let raw = r#"{"limit":10,"category":"agent","outcome":"error","actor":"local","q":"vault","correlationId":"c1"}"#;
        let q: AuditListQuery = serde_json::from_str(raw).unwrap();
        assert_eq!(q.limit, Some(10));
        assert_eq!(q.category.as_deref(), Some("agent"));
        assert_eq!(q.outcome.as_deref(), Some("error"));
        assert_eq!(q.actor.as_deref(), Some("local"));
        assert_eq!(q.q.as_deref(), Some("vault"));
        assert_eq!(q.correlation_id.as_deref(), Some("c1"));
    }

    #[test]
    fn event_serde_includes_correlation_fields() {
        let event = AuditEvent {
            id: "1".into(),
            created_at: 1,
            source: AuditSource::Tauri,
            category: AuditCategory::Agent,
            action: "run".into(),
            actor: "local".into(),
            resource_type: None,
            resource_id: None,
            summary: "hi".into(),
            detail_json: None,
            outcome: AuditOutcome::Ok,
            correlation_id: Some("corr".into()),
            session_id: Some("sess".into()),
            app_version: Some("1.0.0".into()),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["correlationId"], "corr");
        assert_eq!(json["sessionId"], "sess");
        assert_eq!(json["appVersion"], "1.0.0");
        assert_eq!(json["source"], "tauri");
        assert_eq!(json["category"], "agent");
        assert_eq!(json["outcome"], "ok");
    }
}
