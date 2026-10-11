//! Best-effort security audit helpers (never fail the caller).

use scribe_audit::{AuditEventInput, AuditStore};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::audit_db::AuditDbState;
use crate::security::redact_secrets;

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
    let summary = redact_secrets(summary);
    let detail = detail.map(|v| redact_json_value(v));
    store.append(AuditEventInput {
        source: "tauri".into(),
        category: "security".into(),
        action: action.into(),
        summary,
        detail,
        outcome: Some(outcome.into()),
        ..Default::default()
    })?;
    Ok(())
}

fn redact_json_value(value: Value) -> Value {
    match value {
        Value::String(s) => Value::String(redact_secrets(&s)),
        Value::Array(items) => Value::Array(items.into_iter().map(redact_json_value).collect()),
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(k, v)| {
                    let key_l = k.to_ascii_lowercase();
                    if key_l.contains("token")
                        || key_l.contains("password")
                        || key_l.contains("secret")
                    {
                        (k, Value::String("***".into()))
                    } else {
                        (k, redact_json_value(v))
                    }
                })
                .collect(),
        ),
        other => other,
    }
}
