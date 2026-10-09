use std::sync::Mutex;

use scribe_audit::AuditStore;
use tauri::{AppHandle, Manager};

pub struct AuditDbState {
    pub store: Mutex<AuditStore>,
    /// In-memory admin unlock for this app session.
    pub admin_unlocked: Mutex<bool>,
}

pub fn init_audit_db(app: &AppHandle) -> Result<AuditStore, Box<dyn std::error::Error>> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&app_dir)?;
    let path = app_dir.join(scribe_audit::AUDIT_DB_FILE);
    let store = AuditStore::from_path(&path)?;
    Ok(store)
}

pub fn require_admin(state: &AuditDbState) -> Result<(), String> {
    let unlocked = *state
        .admin_unlocked
        .lock()
        .map_err(|e| e.to_string())?;
    if unlocked {
        Ok(())
    } else {
        Err("admin.locked".into())
    }
}
