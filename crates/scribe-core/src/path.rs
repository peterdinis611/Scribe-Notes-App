use std::path::PathBuf;

/// Default Scribe DB path on macOS (Tauri app_data_dir for com.scribe.app).
pub fn default_db_path() -> PathBuf {
    if let Ok(path) = std::env::var("SCRIBE_DB_PATH") {
        return PathBuf::from(path);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Library")
        .join("Application Support")
        .join("com.scribe.app")
        .join("scribe.db")
}
