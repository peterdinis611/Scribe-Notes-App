pub use scribe_core::nlp::{
    followups_from_sidecar, is_chat_memory_citation_title, merge_chat_memory_passages,
    script_path_label, ChatTurn, NlpHealth, NlpSidecar,
};

use std::path::PathBuf;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

pub fn resolve_script_path(app: &AppHandle) -> PathBuf {
    if let Ok(resource_path) = app
        .path()
        .resolve("nlp/scribe_nlp/__main__.py", BaseDirectory::Resource)
    {
        if resource_path.exists() {
            return resource_path;
        }
    }

    scribe_core::nlp::resolve_script_path()
}
