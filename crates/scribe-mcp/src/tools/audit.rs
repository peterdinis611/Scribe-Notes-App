use rmcp::schemars::JsonSchema;
use serde::Deserialize;

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListAuditEventsParams {
    pub limit: Option<usize>,
    /// `agent` | `handoff` | `mcp_tool` | `prefs` | `security` | `nlp` | `admin` | `canvas` | `wiki` | `library`
    pub category: Option<String>,
    /// `tauri` | `mcp` | `system`
    pub source: Option<String>,
    /// `ok` | `error` | `denied`
    pub outcome: Option<String>,
    pub action: Option<String>,
    pub actor: Option<String>,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    /// Substring match against summary (max 80 chars).
    pub q: Option<String>,
    pub correlation_id: Option<String>,
    /// Inclusive unix seconds lower bound.
    pub since: Option<i64>,
    /// Inclusive unix seconds upper bound.
    pub until: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuditEventIdParams {
    pub id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExportAuditEventsParams {
    pub limit: Option<usize>,
    pub category: Option<String>,
    pub source: Option<String>,
    pub outcome: Option<String>,
    pub action: Option<String>,
    pub actor: Option<String>,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub q: Option<String>,
    pub correlation_id: Option<String>,
    pub since: Option<i64>,
    pub until: Option<i64>,
}

impl ListAuditEventsParams {
    pub fn into_query(self) -> scribe_audit::AuditListQuery {
        scribe_audit::AuditListQuery {
            limit: self.limit,
            category: self.category,
            source: self.source,
            outcome: self.outcome,
            action: self.action,
            actor: self.actor,
            resource_type: self.resource_type,
            resource_id: self.resource_id,
            q: self.q,
            correlation_id: self.correlation_id,
            since: self.since,
            until: self.until,
        }
    }
}

impl ExportAuditEventsParams {
    pub fn into_query(self) -> scribe_audit::AuditListQuery {
        scribe_audit::AuditListQuery {
            limit: self.limit.or(Some(200)),
            category: self.category,
            source: self.source,
            outcome: self.outcome,
            action: self.action,
            actor: self.actor,
            resource_type: self.resource_type,
            resource_id: self.resource_id,
            q: self.q,
            correlation_id: self.correlation_id,
            since: self.since,
            until: self.until,
        }
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LibraryVideoIdParams {
    pub id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ParseTemplatePackParams {
    /// Raw JSON string of a `.scribe-templates.json` pack.
    pub raw: String,
}
