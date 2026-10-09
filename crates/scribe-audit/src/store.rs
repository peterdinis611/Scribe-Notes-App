use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::admin::{
    admin_is_configured, change_admin_password, setup_admin_password, verify_admin_password,
};
use crate::db::AuditDb;

pub const EVENTS_KEEP: usize = 5_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    pub id: String,
    pub created_at: i64,
    /// `tauri` | `mcp` | `system`
    pub source: String,
    /// `agent` | `handoff` | `mcp_tool` | `prefs` | `security` | `nlp` | `admin`
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

pub struct AuditStore {
    db: AuditDb,
}

impl AuditStore {
    pub fn new(db: AuditDb) -> Self {
        Self { db }
    }

    pub fn from_path(path: &std::path::Path) -> Result<Self, String> {
        Ok(Self::new(crate::db::open_audit_db(path)?))
    }

    pub fn from_memory() -> Result<Self, String> {
        Ok(Self::new(crate::db::open_audit_db_memory()?))
    }

    pub fn path(&self) -> Option<&std::path::Path> {
        self.db.path.as_deref()
    }

    pub fn append(&self, input: AuditEventInput) -> Result<AuditEvent, String> {
        let summary = input.summary.trim();
        if summary.is_empty() {
            return Err("summary is required".into());
        }
        let source = normalize_source(&input.source);
        let category = normalize_category(&input.category);
        let action = input.action.trim().chars().take(80).collect::<String>();
        if action.is_empty() {
            return Err("action is required".into());
        }
        let outcome = normalize_outcome(input.outcome.as_deref().unwrap_or("ok"));
        let actor = input
            .actor
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("local")
            .chars()
            .take(80)
            .collect::<String>();
        let detail_json = input
            .detail
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|e| e.to_string())?;

        let event = AuditEvent {
            id: Uuid::new_v4().to_string(),
            created_at: chrono::Utc::now().timestamp(),
            source,
            category,
            action,
            actor,
            resource_type: input
                .resource_type
                .map(|value| value.trim().chars().take(64).collect())
                .filter(|value: &String| !value.is_empty()),
            resource_id: input
                .resource_id
                .map(|value| value.trim().chars().take(128).collect())
                .filter(|value: &String| !value.is_empty()),
            summary: summary.chars().take(400).collect(),
            detail_json,
            outcome,
        };

        self.db
            .conn
            .execute(
                "INSERT INTO audit_events \
                 (id, created_at, source, category, action, actor, resource_type, resource_id, \
                  summary, detail_json, outcome) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    event.id,
                    event.created_at,
                    event.source,
                    event.category,
                    event.action,
                    event.actor,
                    event.resource_type,
                    event.resource_id,
                    event.summary,
                    event.detail_json,
                    event.outcome,
                ],
            )
            .map_err(|e| e.to_string())?;

        self.db
            .conn
            .execute(
                "DELETE FROM audit_events WHERE id NOT IN (
                    SELECT id FROM audit_events ORDER BY created_at DESC, id DESC LIMIT ?1
                 )",
                params![EVENTS_KEEP as i64],
            )
            .map_err(|e| e.to_string())?;

        Ok(event)
    }

    pub fn list(
        &self,
        limit: usize,
        category: Option<&str>,
        source: Option<&str>,
    ) -> Result<Vec<AuditEvent>, String> {
        let limit = limit.clamp(1, 500) as i64;
        let category = category
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(normalize_category);
        let source = source
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(normalize_source);

        match (category.as_deref(), source.as_deref()) {
            (Some(category), Some(source)) => self.query_filtered(
                "SELECT id, created_at, source, category, action, actor, resource_type, resource_id, \
                 summary, detail_json, outcome \
                 FROM audit_events WHERE category = ?1 AND source = ?2 \
                 ORDER BY created_at DESC, id DESC LIMIT ?3",
                params![category, source, limit],
            ),
            (Some(category), None) => self.query_filtered(
                "SELECT id, created_at, source, category, action, actor, resource_type, resource_id, \
                 summary, detail_json, outcome \
                 FROM audit_events WHERE category = ?1 \
                 ORDER BY created_at DESC, id DESC LIMIT ?2",
                params![category, limit],
            ),
            (None, Some(source)) => self.query_filtered(
                "SELECT id, created_at, source, category, action, actor, resource_type, resource_id, \
                 summary, detail_json, outcome \
                 FROM audit_events WHERE source = ?1 \
                 ORDER BY created_at DESC, id DESC LIMIT ?2",
                params![source, limit],
            ),
            (None, None) => self.query_filtered(
                "SELECT id, created_at, source, category, action, actor, resource_type, resource_id, \
                 summary, detail_json, outcome \
                 FROM audit_events \
                 ORDER BY created_at DESC, id DESC LIMIT ?1",
                params![limit],
            ),
        }
    }

    fn query_filtered(
        &self,
        sql: &str,
        params: impl rusqlite::Params,
    ) -> Result<Vec<AuditEvent>, String> {
        let mut stmt = self.db.conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params, map_event_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn clear(&self) -> Result<u64, String> {
        let deleted = self
            .db
            .conn
            .execute("DELETE FROM audit_events", [])
            .map_err(|e| e.to_string())?;
        Ok(deleted as u64)
    }

    pub fn count(&self) -> Result<u64, String> {
        let count: i64 = self
            .db
            .conn
            .query_row("SELECT COUNT(*) FROM audit_events", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        Ok(count as u64)
    }

    pub fn admin_configured(&self) -> Result<bool, String> {
        admin_is_configured(&self.db.conn)
    }

    pub fn setup_admin(&self, password: &str) -> Result<(), String> {
        setup_admin_password(&self.db.conn, password)?;
        let _ = self.append(AuditEventInput {
            source: "system".into(),
            category: "admin".into(),
            action: "setup".into(),
            actor: Some("admin".into()),
            summary: "Admin password configured".into(),
            outcome: Some("ok".into()),
            ..Default::default()
        });
        Ok(())
    }

    pub fn verify_admin(&self, password: &str) -> Result<bool, String> {
        verify_admin_password(&self.db.conn, password)
    }

    pub fn change_admin(&self, current: &str, next: &str) -> Result<(), String> {
        change_admin_password(&self.db.conn, current, next)?;
        let _ = self.append(AuditEventInput {
            source: "system".into(),
            category: "admin".into(),
            action: "password_change".into(),
            actor: Some("admin".into()),
            summary: "Admin password changed".into(),
            outcome: Some("ok".into()),
            ..Default::default()
        });
        Ok(())
    }
}

fn map_event_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AuditEvent> {
    Ok(AuditEvent {
        id: row.get(0)?,
        created_at: row.get(1)?,
        source: row.get(2)?,
        category: row.get(3)?,
        action: row.get(4)?,
        actor: row.get(5)?,
        resource_type: row.get(6)?,
        resource_id: row.get(7)?,
        summary: row.get(8)?,
        detail_json: row.get(9)?,
        outcome: row.get(10)?,
    })
}

fn normalize_source(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "mcp" => "mcp".into(),
        "system" => "system".into(),
        _ => "tauri".into(),
    }
}

fn normalize_category(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "handoff" => "handoff".into(),
        "mcp_tool" | "mcp-tool" | "tool" => "mcp_tool".into(),
        "prefs" | "preferences" => "prefs".into(),
        "security" => "security".into(),
        "nlp" => "nlp".into(),
        "admin" => "admin".into(),
        _ => "agent".into(),
    }
}

fn normalize_outcome(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "error" | "fail" | "failed" => "error".into(),
        "denied" | "forbidden" => "denied".into(),
        _ => "ok".into(),
    }
}

/// Convenience helpers used by Tauri / MCP call sites.
pub fn log_ok(
    store: &AuditStore,
    source: &str,
    category: &str,
    action: &str,
    summary: &str,
) -> Result<AuditEvent, String> {
    store.append(AuditEventInput {
        source: source.into(),
        category: category.into(),
        action: action.into(),
        summary: summary.into(),
        outcome: Some("ok".into()),
        ..Default::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn append_list_and_trim() {
        let store = AuditStore::from_memory().unwrap();
        store
            .append(AuditEventInput {
                source: "tauri".into(),
                category: "agent".into(),
                action: "run".into(),
                summary: "Agent run completed".into(),
                resource_type: Some("agent_run".into()),
                resource_id: Some("run-1".into()),
                detail: Some(serde_json::json!({ "tools": ["summarize"] })),
                ..Default::default()
            })
            .unwrap();
        store
            .append(AuditEventInput {
                source: "mcp".into(),
                category: "mcp_tool".into(),
                action: "run_agent".into(),
                summary: "MCP run_agent".into(),
                ..Default::default()
            })
            .unwrap();

        let all = store.list(10, None, None).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(store.list(10, Some("mcp_tool"), None).unwrap().len(), 1);
        assert_eq!(store.list(10, None, Some("tauri")).unwrap().len(), 1);
        assert_eq!(store.count().unwrap(), 2);
    }
}
