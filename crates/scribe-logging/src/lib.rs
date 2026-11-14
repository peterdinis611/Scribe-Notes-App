//! Terminal logging + env level resolution for Scribe.
//!
//! Feature `terminal` (default) installs fern → stderr/stdout (+ optional file)
//! and an in-memory ring for Diagnostics. Hosts call [`init_from_env`] early.
//! Frontend lines go through [`log_frontend_line`].

mod buffer;
mod frontend;
mod level;
mod runtime;
mod scope;
mod settings;

#[cfg(feature = "terminal")]
mod terminal;

pub use buffer::{
    clear_logs, configure_ring_capacity, log_stats, push_line, recent_logs, LogLine, LogStats,
};
pub use frontend::{
    log_frontend_line, mirror_frontend_enabled, normalize_frontend_target, set_mirror_frontend,
};
pub use level::{
    level_filter_name, nlp_debug_enabled, parse_level_filter, resolve_level_from_env, ENV_KEYS,
};
pub use runtime::{
    init_runtime_level, level_enabled, runtime_level, runtime_level_name, set_runtime_level,
};
pub use scope::{is_known_scope, list_scopes, LogScopeInfo, SCOPES};
pub use settings::{
    default_logging_settings, logging_settings_from_env, logging_settings_from_json,
    normalize_logging_settings, LoggingSettings, ModuleLevel, DEFAULT_QUIET_TARGETS,
    DEFAULT_RING_CAPACITY,
};

#[cfg(feature = "terminal")]
pub use terminal::{init_from_env, init_terminal_logger, terminal_logger_ready};

/// Convenience: structured host log when the global logger is ready.
pub fn host_info(target: &str, message: &str) {
    log::info!(target: target, "{message}");
}

pub fn host_warn(target: &str, message: &str) {
    log::warn!(target: target, "{message}");
}

pub fn host_error(target: &str, message: &str) {
    log::error!(target: target, "{message}");
}

pub fn host_debug(target: &str, message: &str) {
    log::debug!(target: target, "{message}");
}
