use crate::audit_db::{require_admin, AuditDbState};
use serde::Deserialize;
use serde_json::Value;
use scribe_audit::{AuditEvent, AuditEventInput, SCHEMA_VERSION};
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
}

#[tauri::command]
pub fn audit_admin_status(audit: State<'_, AuditDbState>) -> Result<AuditAdminStatus, String> {
    let store = audit.store.lock().map_err(|e| e.to_string())?;
    let unlocked = *audit.admin_unlocked.lock().map_err(|e| e.to_string())?;
    Ok(AuditAdminStatus {
        configured: store.admin_configured()?,
        unlocked,
        event_count: store.count()?,
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
}

#[tauri::command]
pub fn list_audit_events(
    audit: State<'_, AuditDbState>,
    input: ListAuditEventsInput,
) -> Result<Vec<AuditEvent>, String> {
    require_admin(&audit)?;
    let store = audit.store.lock().map_err(|e| e.to_string())?;
    store.list(
        input.limit.unwrap_or(100),
        input.category.as_deref(),
        input.source.as_deref(),
    )
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
