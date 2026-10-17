use crate::audit_db::{require_admin, AuditDbState};
use serde::Deserialize;
use serde_json::Value;
use scribe_audit::{
    AuditEvent, AuditEventInput, AuditListQuery, AuditStats, SCHEMA_VERSION,
};
use tauri::State;

#[tauri::command]
pub fn get_audit_schema_version() -> i32 {
    SCHEMA_VERSION
}

#[tauri::command]
pub fn get_audit_db_path(audit: State<'_, AuditDbState>) -> Result<Option<String>, String> {
    let store = audit.store.lock().map_err(|e| e.to_string())?;
    Ok(store.path().map(|path| path.display().to_string()))
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditAdminStatus {
    pub configured: bool,
    pub unlocked: bool,
    pub event_count: u64,
    pub keep_limit: u64,
}

#[tauri::command]
pub fn audit_admin_status(audit: State<'_, AuditDbState>) -> Result<AuditAdminStatus, String> {
    let store = audit.store.lock().map_err(|e| e.to_string())?;
    let unlocked = *audit.admin_unlocked.lock().map_err(|e| e.to_string())?;
    Ok(AuditAdminStatus {
        configured: store.admin_configured()?,
        unlocked,
        event_count: store.count()?,
        keep_limit: store.events_keep()? as u64,
    })
}

#[tauri::command]
pub fn audit_admin_setup(
    audit: State<'_, AuditDbState>,
    password: String,
) -> Result<AuditAdminStatus, String> {
    {
        let store = audit.store.lock().map_err(|e| e.to_string())?;
        store.setup_admin(&password)?;
    }
    *audit.admin_unlocked.lock().map_err(|e| e.to_string())? = true;
    audit_admin_status(audit)
}

#[tauri::command]
pub fn audit_admin_unlock(
    audit: State<'_, AuditDbState>,
    password: String,
) -> Result<AuditAdminStatus, String> {
    let ok = {
        let store = audit.store.lock().map_err(|e| e.to_string())?;
        store.verify_admin(&password)?
    };
    if !ok {
        let store = audit.store.lock().map_err(|e| e.to_string())?;
        let _ = store.append(AuditEventInput {
            source: "tauri".into(),
            category: "admin".into(),
            action: "unlock_failed".into(),
            actor: Some("admin".into()),
            summary: "Admin unlock failed".into(),
            outcome: Some("denied".into()),
            ..Default::default()
        });
        return Err("admin.invalidPassword".into());
    }
    *audit.admin_unlocked.lock().map_err(|e| e.to_string())? = true;
    {
        let store = audit.store.lock().map_err(|e| e.to_string())?;
        let _ = store.append(AuditEventInput {
            source: "tauri".into(),
            category: "admin".into(),
            action: "unlock".into(),
            actor: Some("admin".into()),
            summary: "Admin unlocked audit log".into(),
            outcome: Some("ok".into()),
            ..Default::default()
        });
    }
    audit_admin_status(audit)
}

#[tauri::command]
pub fn audit_admin_lock(audit: State<'_, AuditDbState>) -> Result<AuditAdminStatus, String> {
    *audit.admin_unlocked.lock().map_err(|e| e.to_string())? = false;
    {
        let store = audit.store.lock().map_err(|e| e.to_string())?;
        let _ = store.append(AuditEventInput {
            source: "tauri".into(),
            category: "admin".into(),
            action: "lock".into(),
            actor: Some("admin".into()),
            summary: "Admin locked audit log".into(),
            outcome: Some("ok".into()),
            ..Default::default()
        });
    }
    audit_admin_status(audit)
}

#[tauri::command]
pub fn audit_admin_change_password(
    audit: State<'_, AuditDbState>,
    current_password: String,
    new_password: String,
) -> Result<AuditAdminStatus, String> {
    require_admin(&audit)?;
    {
        let store = audit.store.lock().map_err(|e| e.to_string())?;
        store.change_admin(&current_password, &new_password)?;
    }
    audit_admin_status(audit)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAuditEventsInput {
    pub limit: Option<usize>,
    pub category: Option<String>,
    pub source: Option<String>,
    pub outcome: Option<String>,
    pub action: Option<String>,
    pub since: Option<i64>,
    pub until: Option<i64>,
}

impl ListAuditEventsInput {
    fn into_query(self) -> AuditListQuery {
        AuditListQuery {
            limit: self.limit,
            category: self.category,
            source: self.source,
            outcome: self.outcome,
            action: self.action,
            since: self.since,
            until: self.until,
        }
    }
}

#[tauri::command]
pub fn list_audit_events(
    audit: State<'_, AuditDbState>,
    input: ListAuditEventsInput,
) -> Result<Vec<AuditEvent>, String> {
    require_admin(&audit)?;
    let store = audit.store.lock().map_err(|e| e.to_string())?;
    store.list_query(input.into_query())
}

#[tauri::command]
pub fn get_audit_stats(audit: State<'_, AuditDbState>) -> Result<AuditStats, String> {
    require_admin(&audit)?;
    let store = audit.store.lock().map_err(|e| e.to_string())?;
    store.stats()
}

#[tauri::command]
pub fn export_audit_events_jsonl(
    audit: State<'_, AuditDbState>,
    input: ListAuditEventsInput,
) -> Result<String, String> {
    require_admin(&audit)?;
    let store = audit.store.lock().map_err(|e| e.to_string())?;
    store.export_jsonl(input.into_query())
}

#[tauri::command]
pub fn purge_audit_events_before(
    audit: State<'_, AuditDbState>,
    before: i64,
) -> Result<u64, String> {
    require_admin(&audit)?;
    let store = audit.store.lock().map_err(|e| e.to_string())?;
    let deleted = store.purge_before(before)?;
    let _ = store.append(AuditEventInput {
        source: "tauri".into(),
        category: "admin".into(),
        action: "purge".into(),
        actor: Some("admin".into()),
        summary: format!("Purged {deleted} audit events before {before}"),
        detail: Some(serde_json::json!({ "before": before, "deleted": deleted })),
        outcome: Some("ok".into()),
        ..Default::default()
    });
    Ok(deleted)
}

#[tauri::command]
pub fn set_audit_events_keep(
    audit: State<'_, AuditDbState>,
    keep: usize,
) -> Result<AuditAdminStatus, String> {
    require_admin(&audit)?;
    {
        let store = audit.store.lock().map_err(|e| e.to_string())?;
        let applied = store.set_events_keep(keep)?;
        let _ = store.append(AuditEventInput {
            source: "tauri".into(),
            category: "admin".into(),
            action: "set_keep".into(),
            actor: Some("admin".into()),
            summary: format!("Retention keep set to {applied}"),
            detail: Some(serde_json::json!({ "keep": applied })),
            outcome: Some("ok".into()),
            ..Default::default()
        });
    }
    audit_admin_status(audit)
}

#[tauri::command]
pub fn clear_audit_events(audit: State<'_, AuditDbState>) -> Result<u64, String> {
    require_admin(&audit)?;
    let store = audit.store.lock().map_err(|e| e.to_string())?;
    let deleted = store.clear()?;
    let _ = store.append(AuditEventInput {
        source: "tauri".into(),
        category: "admin".into(),
        action: "clear".into(),
        actor: Some("admin".into()),
        summary: format!("Cleared {deleted} audit events"),
        outcome: Some("ok".into()),
        ..Default::default()
    });
    Ok(deleted)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditSecurityEventInput {
    pub action: String,
    pub summary: String,
    pub detail: Option<Value>,
    pub outcome: Option<String>,
}

/// Frontend-callable security audit (vault unlock, etc.). Soft-fails never.
#[tauri::command]
pub fn audit_security_event(
    audit: State<'_, AuditDbState>,
    input: AuditSecurityEventInput,
) -> Result<(), String> {
    let action = input.action.trim();
    if action.is_empty() || action.len() > 80 {
        return Err("invalid action".into());
    }
    // Allowlist of FE-originated security actions.
    const ALLOWED: &[&str] = &[
        "vault_unlock",
        "vault_unlock_document",
        "vault_lock",
        "csp_violation",
    ];
    if !ALLOWED.contains(&action) {
        return Err(format!("action not allowed: {action}"));
    }
    let store = audit.store.lock().map_err(|e| e.to_string())?;
    let _ = store.append(AuditEventInput {
        source: "tauri".into(),
        category: "security".into(),
        action: action.into(),
        summary: input.summary.chars().take(200).collect(),
        detail: input.detail,
        outcome: Some(input.outcome.unwrap_or_else(|| "ok".into())),
        ..Default::default()
    });
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditCanvasEventInput {
    pub action: String,
    pub summary: String,
    pub detail: Option<Value>,
    pub outcome: Option<String>,
}

/// Frontend-callable canvas audit (create / move / delete / export). Soft-fail never.
#[tauri::command]
pub fn audit_canvas_event(
    audit: State<'_, AuditDbState>,
    input: AuditCanvasEventInput,
) -> Result<(), String> {
    let action = input.action.trim();
    if action.is_empty() || action.len() > 80 {
        return Err("invalid action".into());
    }
    const ALLOWED: &[&str] = &[
        "canvas_create",
        "canvas_object_create",
        "canvas_object_delete",
        "canvas_object_move",
        "canvas_export_svg",
        "canvas_export_png",
        "canvas_export_tiptap",
        "canvas_template",
    ];
    if !ALLOWED.contains(&action) {
        return Err(format!("action not allowed: {action}"));
    }
    let store = audit.store.lock().map_err(|e| e.to_string())?;
    let _ = store.append(AuditEventInput {
        source: "tauri".into(),
        category: "canvas".into(),
        action: action.into(),
        resource_type: Some("canvas".into()),
        summary: input.summary.chars().take(200).collect(),
        detail: input.detail,
        outcome: Some(input.outcome.unwrap_or_else(|| "ok".into())),
        ..Default::default()
    });
    Ok(())
}

/// Soft-fail helper for other command modules.
pub fn append_audit(
    audit: &AuditDbState,
    source: &str,
    category: &str,
    action: &str,
    summary: &str,
    detail: Option<Value>,
    outcome: &str,
) {
    let Ok(store) = audit.store.lock() else {
        return;
    };
    let _ = store.append(AuditEventInput {
        source: source.into(),
        category: category.into(),
        action: action.into(),
        summary: summary.into(),
        detail,
        outcome: Some(outcome.into()),
        ..Default::default()
    });
}
