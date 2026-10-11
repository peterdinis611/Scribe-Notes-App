//! Best-effort security audit helpers (never fail the caller).

use scribe_audit::{AuditEventInput, AuditStore};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::audit_db::AuditDbState;

pub fn log_security(
    app: &AppHandle,
    action: &str,
    summary: &str,
    detail: Option<Value>,
    outcome: &str,
) {
    let Some(state) = app.try_state::<AuditDbState>() else {
        return;
    };
    let Ok(store) = state.store.lock() else {
        return;
    };
    let _ = append_security(&store, action, summary, detail, outcome);
}

pub fn append_security(
    store: &AuditStore,
    action: &str,
    summary: &str,
    detail: Option<Value>,
    outcome: &str,
) -> Result<(), String> {
    store.append(AuditEventInput {
        source: "tauri".into(),
        category: "security".into(),
        action: action.into(),
        summary: summary.into(),
        detail,
        outcome: Some(outcome.into()),
        ..Default::default()
    })?;
    Ok(())
}
