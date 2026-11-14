//! Tauri surface for `scribe-logging` — status, ring, FE bridge, runtime level.

use serde::Serialize;
use scribe_logging::{LogLine, LogScopeInfo, LogStats, LoggingSettings};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoggingStatus {
    pub ready: bool,
    pub level: String,
    pub runtime_level: String,
    pub nlp_debug: bool,
    pub mirror_frontend: bool,
    pub settings: LoggingSettings,
    pub env_keys: Vec<&'static str>,
    pub stats: LogStats,
    pub file_path: Option<String>,
}

fn status_now() -> LoggingStatus {
    let settings = scribe_logging::logging_settings_from_env();
    LoggingStatus {
        ready: scribe_logging::terminal_logger_ready(),
        level: settings.level.clone(),
        runtime_level: scribe_logging::runtime_level_name().to_string(),
        nlp_debug: scribe_logging::nlp_debug_enabled(),
        mirror_frontend: scribe_logging::mirror_frontend_enabled(),
        file_path: settings.file_path.clone(),
        settings,
        env_keys: scribe_logging::ENV_KEYS.to_vec(),
        stats: scribe_logging::log_stats(),
    }
}

#[tauri::command]
pub fn logging_status() -> LoggingStatus {
    status_now()
}

#[tauri::command]
pub fn logging_settings() -> LoggingSettings {
    scribe_logging::logging_settings_from_env()
}

#[tauri::command]
pub fn normalize_logging_settings(settings: LoggingSettings) -> LoggingSettings {
    scribe_logging::normalize_logging_settings(settings)
}

#[tauri::command]
pub fn logging_settings_from_json(raw: String) -> Result<LoggingSettings, String> {
    scribe_logging::logging_settings_from_json(&raw)
}

#[tauri::command]
pub fn logging_write(level: String, target: String, message: String) -> bool {
    scribe_logging::log_frontend_line(&level, &target, &message)
}

#[tauri::command]
pub fn logging_ping() -> LoggingStatus {
    let _ = scribe_logging::log_frontend_line(
        "info",
        "scribe.fe.diagnostics",
        "logging_ping — FE → terminal bridge ok",
    );
    log::info!(target: "scribe.logging", "logging_ping from host");
    status_now()
}

#[tauri::command]
pub fn logging_recent(
    limit: Option<usize>,
    min_level: Option<String>,
    target_prefix: Option<String>,
) -> Vec<LogLine> {
    scribe_logging::recent_logs(
        limit.unwrap_or(100),
        min_level.as_deref(),
        target_prefix.as_deref(),
    )
}

#[tauri::command]
pub fn logging_clear() -> LogStats {
    scribe_logging::clear_logs();
    log::info!(target: "scribe.logging", "log ring cleared");
    scribe_logging::log_stats()
}

#[tauri::command]
pub fn logging_stats() -> LogStats {
    scribe_logging::log_stats()
}

#[tauri::command]
pub fn logging_set_level(level: String) -> LoggingStatus {
    let next = scribe_logging::set_runtime_level(&level);
    log::info!(
        target: "scribe.logging",
        "runtime log level → {}",
        scribe_logging::level_filter_name(next)
    );
    status_now()
}

#[tauri::command]
pub fn logging_scopes() -> Vec<LogScopeInfo> {
    scribe_logging::list_scopes()
}
