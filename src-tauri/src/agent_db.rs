use std::sync::Mutex;

use scribe_agent::AgentStore;
use tauri::{AppHandle, Manager};

pub struct AgentDbState {
    pub store: Mutex<AgentStore>,
}

pub fn init_agent_db(app: &AppHandle) -> Result<AgentStore, Box<dyn std::error::Error>> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&app_dir)?;
    let path = app_dir.join(scribe_agent::AGENT_DB_FILE);
    let store = AgentStore::from_path(&path)?;
    Ok(store)
}
