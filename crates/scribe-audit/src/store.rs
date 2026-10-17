use rusqlite::{params, params_from_iter, ToSql};
use uuid::Uuid;

use crate::admin::{
    admin_is_configured, change_admin_password, setup_admin_password, verify_admin_password,
};
use crate::db::AuditDb;
use crate::types::{
    normalize_action, normalize_category, normalize_outcome, normalize_source, AuditCountBucket,
    AuditEvent, AuditEventInput, AuditListQuery, AuditStats,
};

pub const EVENTS_KEEP_DEFAULT: usize = 5_000;
pub const EVENTS_KEEP_MIN: usize = 100;
pub const EVENTS_KEEP_MAX: usize = 50_000;
const EVENTS_KEEP_META: &str = "events_keep";

/// Back-compat alias.
pub const EVENTS_KEEP: usize = EVENTS_KEEP_DEFAULT;

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

    pub fn events_keep(&self) -> Result<usize, String> {
        let raw: Option<String> = self
            .db
            .conn
            .query_row(
                "SELECT value FROM meta WHERE key = ?1",
                [EVENTS_KEEP_META],
                |row| row.get(0),
            )
            .ok();
        let value = raw
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(EVENTS_KEEP_DEFAULT);
        Ok(value.clamp(EVENTS_KEEP_MIN, EVENTS_KEEP_MAX))
    }

    pub fn set_events_keep(&self, keep: usize) -> Result<usize, String> {
        let keep = keep.clamp(EVENTS_KEEP_MIN, EVENTS_KEEP_MAX);
        self.db
            .conn
            .execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
                params![EVENTS_KEEP_META, keep.to_string()],
            )
            .map_err(|e| e.to_string())?;
        self.trim_to_keep(keep)?;
        Ok(keep)
    }

    pub fn append(&self, input: AuditEventInput) -> Result<AuditEvent, String> {
        let summary = input.summary.trim();
        if summary.is_empty() {
            return Err("summary is required".into());
        }
        let source = normalize_source(&input.source);
        let category = normalize_category(&input.category);
        let action = normalize_action(&input.action);
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

        let keep = self.events_keep().unwrap_or(EVENTS_KEEP_DEFAULT);
        self.trim_to_keep(keep)?;
        Ok(event)
    }

    fn trim_to_keep(&self, keep: usize) -> Result<(), String> {
        self.db
            .conn
            .execute(
                "DELETE FROM audit_events WHERE id NOT IN (
                    SELECT id FROM audit_events ORDER BY created_at DESC, id DESC LIMIT ?1
                 )",
                params![keep as i64],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Legacy list API (category + source only).
    pub fn list(
        &self,
        limit: usize,
        category: Option<&str>,
        source: Option<&str>,
    ) -> Result<Vec<AuditEvent>, String> {
        self.list_query(AuditListQuery {
            limit: Some(limit),
            category: category.map(str::to_string),
            source: source.map(str::to_string),
            ..Default::default()
        })
    }

    pub fn list_query(&self, query: AuditListQuery) -> Result<Vec<AuditEvent>, String> {
        let limit = query.limit.unwrap_or(100).clamp(1, 500) as i64;
        let mut sql = String::from(
            "SELECT id, created_at, source, category, action, actor, resource_type, resource_id, \
             summary, detail_json, outcome FROM audit_events WHERE 1=1",
        );
        let mut binds: Vec<Box<dyn ToSql>> = Vec::new();

        if let Some(category) = query
            .category
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            sql.push_str(" AND category = ?");
            binds.push(Box::new(normalize_category(category)));
        }
        if let Some(source) = query
            .source
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            sql.push_str(" AND source = ?");
            binds.push(Box::new(normalize_source(source)));
        }
        if let Some(outcome) = query
            .outcome
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            sql.push_str(" AND outcome = ?");
            binds.push(Box::new(normalize_outcome(outcome)));
        }
        if let Some(action) = query
            .action
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            sql.push_str(" AND action = ?");
            binds.push(Box::new(normalize_action(action)));
        }
        if let Some(since) = query.since {
            sql.push_str(" AND created_at >= ?");
            binds.push(Box::new(since));
        }
        if let Some(until) = query.until {
            sql.push_str(" AND created_at <= ?");
            binds.push(Box::new(until));
        }

        sql.push_str(" ORDER BY created_at DESC, id DESC LIMIT ?");
        binds.push(Box::new(limit));

        let mut stmt = self.db.conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params_from_iter(binds.iter().map(|b| b.as_ref())), map_event_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn get(&self, id: &str) -> Result<Option<AuditEvent>, String> {
        let id = id.trim();
        if id.is_empty() {
            return Ok(None);
        }
        let mut stmt = self
            .db
            .conn
            .prepare(
                "SELECT id, created_at, source, category, action, actor, resource_type, resource_id, \
                 summary, detail_json, outcome FROM audit_events WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt
            .query_map(params![id], map_event_row)
            .map_err(|e| e.to_string())?;
        match rows.next() {
            Some(row) => Ok(Some(row.map_err(|e| e.to_string())?)),
            None => Ok(None),
        }
    }

    pub fn stats(&self) -> Result<AuditStats, String> {
        let total = self.count()?;
        let keep_limit = self.events_keep()? as u64;
        let oldest_at: Option<i64> = self
            .db
            .conn
            .query_row("SELECT MIN(created_at) FROM audit_events", [], |row| {
                row.get::<_, Option<i64>>(0)
            })
            .unwrap_or(None);
        let newest_at: Option<i64> = self
            .db
            .conn
            .query_row("SELECT MAX(created_at) FROM audit_events", [], |row| {
                row.get::<_, Option<i64>>(0)
            })
            .unwrap_or(None);

        Ok(AuditStats {
            total,
            keep_limit,
            oldest_at,
            newest_at,
            by_category: self.count_group("category")?,
            by_source: self.count_group("source")?,
            by_outcome: self.count_group("outcome")?,
        })
    }

    fn count_group(&self, column: &str) -> Result<Vec<AuditCountBucket>, String> {
        // column is internal-only allowlist
        if !matches!(column, "category" | "source" | "outcome") {
            return Err("invalid group column".into());
        }
        let sql = format!(
            "SELECT {column}, COUNT(*) FROM audit_events GROUP BY {column} ORDER BY COUNT(*) DESC, {column} ASC"
        );
        let mut stmt = self.db.conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(AuditCountBucket {
                    key: row.get(0)?,
                    count: row.get::<_, i64>(1)? as u64,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    /// NDJSON export (one event per line), newest first.
    pub fn export_jsonl(&self, query: AuditListQuery) -> Result<String, String> {
        let mut q = query;
        if q.limit.is_none() {
            q.limit = Some(2_000);
        }
        let events = self.list_query(q)?;
        let mut out = String::new();
        for event in events {
            let line = serde_json::to_string(&event).map_err(|e| e.to_string())?;
            out.push_str(&line);
            out.push('\n');
        }
        Ok(out)
    }

    pub fn clear(&self) -> Result<u64, String> {
        let deleted = self
            .db
            .conn
            .execute("DELETE FROM audit_events", [])
            .map_err(|e| e.to_string())?;
        Ok(deleted as u64)
    }

    /// Delete events with `created_at` strictly less than `before` (unix seconds).
    pub fn purge_before(&self, before: i64) -> Result<u64, String> {
        let deleted = self
            .db
            .conn
            .execute(
                "DELETE FROM audit_events WHERE created_at < ?1",
                params![before],
            )
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

pub fn log_denied(
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
        outcome: Some("denied".into()),
        ..Default::default()
    })
}

pub fn log_error(
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
        outcome: Some("error".into()),
        ..Default::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(source: &str, category: &str, action: &str, summary: &str, outcome: Option<&str>) -> AuditEventInput {
        AuditEventInput {
            source: source.into(),
            category: category.into(),
            action: action.into(),
            summary: summary.into(),
            outcome: outcome.map(str::to_string),
            ..Default::default()
        }
    }

    #[test]
    fn append_list_filter_stats_and_export() {
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
            .append(sample("mcp", "mcp_tool", "run_agent", "MCP run_agent", Some("error")))
            .unwrap();

        assert_eq!(store.list(10, None, None).unwrap().len(), 2);
        assert_eq!(
            store
                .list_query(AuditListQuery {
                    outcome: Some("error".into()),
                    ..Default::default()
                })
                .unwrap()
                .len(),
            1
        );
        let stats = store.stats().unwrap();
        assert_eq!(stats.total, 2);
        assert_eq!(stats.keep_limit, EVENTS_KEEP_DEFAULT as u64);
        assert!(stats.oldest_at.is_some());
        assert!(stats.newest_at.is_some());
        assert!(stats.by_source.iter().any(|b| b.key == "mcp" && b.count == 1));
        assert!(stats.by_outcome.iter().any(|b| b.key == "error" && b.count == 1));
        let jsonl = store
            .export_jsonl(AuditListQuery {
                limit: Some(10),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(jsonl.lines().count(), 2);
        let agent = store
            .list_query(AuditListQuery {
                category: Some("agent".into()),
                ..Default::default()
            })
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        let got = store.get(&agent.id).unwrap().unwrap();
        assert_eq!(got.summary, "Agent run completed");
        assert!(got.detail_json.as_deref().unwrap().contains("summarize"));
    }

    #[test]
    fn rejects_empty_summary_and_action() {
        let store = AuditStore::from_memory().unwrap();
        assert!(store
            .append(sample("tauri", "agent", "run", "   ", None))
            .is_err());
        assert!(store
            .append(sample("tauri", "agent", "  ", "ok summary", None))
            .is_err());
    }

    #[test]
    fn defaults_actor_outcome_and_normalizes() {
        let store = AuditStore::from_memory().unwrap();
        let event = store
            .append(AuditEventInput {
                source: "DESKTOP".into(),
                category: "mcp-tool".into(),
                action: "  ping  ".into(),
                summary: "hi".into(),
                outcome: Some("failed".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(event.source, "tauri");
        assert_eq!(event.category, "mcp_tool");
        assert_eq!(event.action, "ping");
        assert_eq!(event.actor, "local");
        assert_eq!(event.outcome, "error");
    }

    #[test]
    fn list_query_filters_source_category_action_and_time() {
        let store = AuditStore::from_memory().unwrap();
        let a = store
            .append(sample("tauri", "security", "vault_lock", "lock", Some("ok")))
            .unwrap();
        let b = store
            .append(sample("mcp", "wiki", "resolve", "wiki hit", Some("denied")))
            .unwrap();

        assert_eq!(
            store
                .list_query(AuditListQuery {
                    source: Some("mcp".into()),
                    ..Default::default()
                })
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            store
                .list_query(AuditListQuery {
                    category: Some("security".into()),
                    ..Default::default()
                })
                .unwrap()[0]
                .id,
            a.id
        );
        assert_eq!(
            store
                .list_query(AuditListQuery {
                    action: Some("resolve".into()),
                    ..Default::default()
                })
                .unwrap()[0]
                .id,
            b.id
        );
        assert_eq!(
            store
                .list_query(AuditListQuery {
                    outcome: Some("denied".into()),
                    ..Default::default()
                })
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            store
                .list_query(AuditListQuery {
                    since: Some(a.created_at),
                    until: Some(b.created_at),
                    ..Default::default()
                })
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            store
                .list_query(AuditListQuery {
                    until: Some(a.created_at - 1),
                    ..Default::default()
                })
                .unwrap()
                .len(),
            0
        );
        assert_eq!(store.list(10, Some("wiki"), Some("mcp")).unwrap().len(), 1);
    }

    #[test]
    fn list_limit_clamps() {
        let store = AuditStore::from_memory().unwrap();
        for i in 0..5 {
            store
                .append(sample("tauri", "agent", "run", &format!("e{i}"), None))
                .unwrap();
        }
        assert_eq!(
            store
                .list_query(AuditListQuery {
                    limit: Some(0),
                    ..Default::default()
                })
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            store
                .list_query(AuditListQuery {
                    limit: Some(3),
                    ..Default::default()
                })
                .unwrap()
                .len(),
            3
        );
    }

    #[test]
    fn get_missing_and_blank_id() {
        let store = AuditStore::from_memory().unwrap();
        assert!(store.get("missing").unwrap().is_none());
        assert!(store.get("").unwrap().is_none());
        assert!(store.get("   ").unwrap().is_none());
    }

    #[test]
    fn clear_removes_all_then_allows_append() {
        let store = AuditStore::from_memory().unwrap();
        store
            .append(sample("tauri", "agent", "run", "one", None))
            .unwrap();
        assert_eq!(store.clear().unwrap(), 1);
        assert_eq!(store.count().unwrap(), 0);
        let stats = store.stats().unwrap();
        assert_eq!(stats.total, 0);
        assert!(stats.oldest_at.is_none());
        store
            .append(sample("system", "admin", "setup", "again", None))
            .unwrap();
        assert_eq!(store.count().unwrap(), 1);
    }

    #[test]
    fn purge_before_and_retention() {
        let store = AuditStore::from_memory().unwrap();
        store.set_events_keep(100).unwrap();
        store
            .append(sample("tauri", "security", "vault_lock", "old", None))
            .unwrap();
        let now = chrono::Utc::now().timestamp();
        let deleted = store.purge_before(now + 10).unwrap();
        assert_eq!(deleted, 1);
        assert_eq!(store.count().unwrap(), 0);
        assert_eq!(store.purge_before(now).unwrap(), 0);
    }

    #[test]
    fn trim_to_keep_drops_oldest() {
        let store = AuditStore::from_memory().unwrap();
        let first = store
            .append(sample("tauri", "agent", "a", "first", None))
            .unwrap();
        let second = store
            .append(sample("tauri", "agent", "b", "second", None))
            .unwrap();
        let third = store
            .append(sample("tauri", "agent", "c", "third", None))
            .unwrap();
        // Force distinct timestamps so retention order is deterministic.
        for (ts, id) in [(100i64, &first.id), (200, &second.id), (300, &third.id)] {
            store
                .db
                .conn
                .execute(
                    "UPDATE audit_events SET created_at = ?1 WHERE id = ?2",
                    params![ts, id],
                )
                .unwrap();
        }
        // Bypass set_events_keep clamp (min 100) — exercise trim directly.
        store.trim_to_keep(2).unwrap();
        assert_eq!(store.count().unwrap(), 2);
        let list = store.list(10, None, None).unwrap();
        assert_eq!(list[0].summary, "third");
        assert_eq!(list[1].summary, "second");
        assert!(store.get(&first.id).unwrap().is_none());
    }

    #[test]
    fn events_keep_clamps_bounds() {
        let store = AuditStore::from_memory().unwrap();
        assert_eq!(store.set_events_keep(1).unwrap(), EVENTS_KEEP_MIN);
        assert_eq!(store.set_events_keep(999_999).unwrap(), EVENTS_KEEP_MAX);
        assert_eq!(store.events_keep().unwrap(), EVENTS_KEEP_MAX);
    }

    #[test]
    fn export_jsonl_respects_filters_and_parses() {
        let store = AuditStore::from_memory().unwrap();
        store
            .append(sample("tauri", "agent", "run", "ok one", Some("ok")))
            .unwrap();
        store
            .append(sample("mcp", "agent", "run", "err one", Some("error")))
            .unwrap();
        let jsonl = store
            .export_jsonl(AuditListQuery {
                outcome: Some("error".into()),
                limit: Some(50),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(jsonl.lines().count(), 1);
        let event: AuditEvent = serde_json::from_str(jsonl.lines().next().unwrap()).unwrap();
        assert_eq!(event.outcome, "error");
        assert_eq!(event.source, "mcp");
    }

    #[test]
    fn log_helpers_set_outcomes() {
        let store = AuditStore::from_memory().unwrap();
        assert_eq!(
            log_ok(&store, "tauri", "agent", "run", "ok").unwrap().outcome,
            "ok"
        );
        assert_eq!(
            log_denied(&store, "tauri", "security", "vault", "nope")
                .unwrap()
                .outcome,
            "denied"
        );
        assert_eq!(
            log_error(&store, "mcp", "mcp_tool", "fail", "boom")
                .unwrap()
                .outcome,
            "error"
        );
        assert_eq!(store.count().unwrap(), 3);
    }

    #[test]
    fn store_admin_flow_logs_events() {
        let store = AuditStore::from_memory().unwrap();
        assert!(!store.admin_configured().unwrap());
        store.setup_admin("scribe-admin").unwrap();
        assert!(store.admin_configured().unwrap());
        assert!(store.verify_admin("scribe-admin").unwrap());
        store.change_admin("scribe-admin", "new-pass-ok").unwrap();
        assert!(store.verify_admin("new-pass-ok").unwrap());
        let events = store.list(10, Some("admin"), Some("system")).unwrap();
        assert!(events.iter().any(|e| e.action == "setup"));
        assert!(events.iter().any(|e| e.action == "password_change"));
    }

    #[test]
    fn truncates_long_fields() {
        let store = AuditStore::from_memory().unwrap();
        let event = store
            .append(AuditEventInput {
                source: "tauri".into(),
                category: "agent".into(),
                action: "x".repeat(120),
                actor: Some("a".repeat(200)),
                resource_type: Some("t".repeat(100)),
                resource_id: Some("i".repeat(200)),
                summary: "s".repeat(500),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(event.action.len(), 80);
        assert_eq!(event.actor.len(), 80);
        assert_eq!(event.resource_type.as_ref().unwrap().len(), 64);
        assert_eq!(event.resource_id.as_ref().unwrap().len(), 128);
        assert_eq!(event.summary.len(), 400);
    }
}
