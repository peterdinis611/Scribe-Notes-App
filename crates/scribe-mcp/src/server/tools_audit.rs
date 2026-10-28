use crate::server::ScribeMcp;
use crate::tools;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::{tool, tool_router};
use scribe_audit::AUDIT_DB_FILE;

#[tool_router(router = router_audit, vis = "pub(crate)")]
impl ScribeMcp {
    #[tool(
        description = "Audit DB status: path, event count, schema version, writable retention keep. Soft-fails if scribe-audit.db is missing."
    )]
    fn audit_status(&self) -> Result<String, String> {
        let parent = self
            .db_path
            .parent()
            .ok_or_else(|| "Cannot resolve audit DB parent path".to_string())?;
        let path = parent.join(AUDIT_DB_FILE);
        let Some(store) = self.open_audit_store() else {
            return Ok(tools::json(&serde_json::json!({
                "ok": false,
                "path": path.to_string_lossy(),
                "exists": path.exists(),
                "message": "Could not open scribe-audit.db",
            })));
        };
        let count = store.count().unwrap_or(0);
        let stats = store.stats().ok();
        Ok(tools::json(&serde_json::json!({
            "ok": true,
            "path": path.to_string_lossy(),
            "exists": path.exists(),
            "count": count,
            "schemaVersion": scribe_audit::SCHEMA_VERSION,
            "stats": stats,
        })))
    }

    #[tool(
        description = "List audit events from scribe-audit.db (newest first). Filter by category/source/outcome/action/actor/q/since/until. Limit 1–500 (default 100)."
    )]
    fn list_audit_events(
        &self,
        Parameters(params): Parameters<tools::ListAuditEventsParams>,
    ) -> Result<String, String> {
        let store = self
            .open_audit_store()
            .ok_or_else(|| "Audit DB unavailable (scribe-audit.db)".to_string())?;
        let events = store.list_query(params.into_query())?;
        Ok(tools::json(&serde_json::json!({
            "count": events.len(),
            "events": events,
        })))
    }

    #[tool(description = "Fetch one audit event by id from scribe-audit.db.")]
    fn get_audit_event(
        &self,
        Parameters(params): Parameters<tools::AuditEventIdParams>,
    ) -> Result<String, String> {
        let id = params.id.trim();
        if id.is_empty() {
            return Err("id is required".into());
        }
        let store = self
            .open_audit_store()
            .ok_or_else(|| "Audit DB unavailable (scribe-audit.db)".to_string())?;
        let event = store
            .get(id)?
            .ok_or_else(|| format!("Audit event not found: {id}"))?;
        Ok(tools::json(&event))
    }

    #[tool(
        description = "Aggregate audit stats: totals, keep limit, oldest/newest, buckets by category/source/outcome/action/actor."
    )]
    fn get_audit_stats(&self) -> Result<String, String> {
        let store = self
            .open_audit_store()
            .ok_or_else(|| "Audit DB unavailable (scribe-audit.db)".to_string())?;
        Ok(tools::json(&store.stats()?))
    }

    #[tool(
        description = "Export matching audit events as JSON Lines (one event per line). Same filters as list_audit_events; default limit 200."
    )]
    fn export_audit_events_jsonl(
        &self,
        Parameters(params): Parameters<tools::ExportAuditEventsParams>,
    ) -> Result<String, String> {
        let store = self
            .open_audit_store()
            .ok_or_else(|| "Audit DB unavailable (scribe-audit.db)".to_string())?;
        let body = store.export_jsonl(params.into_query())?;
        Ok(body)
    }
}
