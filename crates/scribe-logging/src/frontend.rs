//! Accept log lines from the webview and print them via the global `log` crate
//! (→ fern → terminal + ring).

use std::sync::atomic::{AtomicBool, Ordering};

use log::{Level, LevelFilter};

use crate::buffer::push_line;
use crate::level::parse_level_filter;

static MIRROR_FRONTEND: AtomicBool = AtomicBool::new(true);

pub fn set_mirror_frontend(enabled: bool) {
    MIRROR_FRONTEND.store(enabled, Ordering::SeqCst);
}

pub fn mirror_frontend_enabled() -> bool {
    MIRROR_FRONTEND.load(Ordering::SeqCst)
}

fn level_from_name(raw: &str) -> Option<Level> {
    match parse_level_filter(raw) {
        LevelFilter::Off => None,
        LevelFilter::Error => Some(Level::Error),
        LevelFilter::Warn => Some(Level::Warn),
        LevelFilter::Info => Some(Level::Info),
        LevelFilter::Debug => Some(Level::Debug),
        LevelFilter::Trace => Some(Level::Trace),
    }
}

/// Sanitize a FE-provided target so it stays a short dotted identifier.
pub fn normalize_frontend_target(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('.').trim_matches('_');
    if trimmed.is_empty() {
        "scribe.fe".to_string()
    } else if trimmed.starts_with("scribe.") {
        trimmed.to_string()
    } else {
        format!("scribe.fe.{trimmed}")
    }
}

/// Forward a frontend log line into the terminal logger (+ ring).
pub fn log_frontend_line(level: &str, target: &str, message: &str) -> bool {
    if !mirror_frontend_enabled() {
        return false;
    }
    let Some(level) = level_from_name(level) else {
        return false;
    };
    if !crate::runtime::level_enabled(level) {
        return false;
    }
    let target = normalize_frontend_target(target);
    let message = message.trim_end();
    if message.is_empty() {
        return false;
    }
    let message = if message.len() > 4000 {
        format!("{}…", &message[..3997])
    } else {
        message.to_string()
    };

    #[cfg(feature = "terminal")]
    let logger_ready = crate::terminal_logger_ready();
    #[cfg(not(feature = "terminal"))]
    let logger_ready = false;

    if logger_ready {
        log::log!(target: target.as_str(), level, "{message}");
    } else {
        // No global logger yet — still keep Diagnostics ring warm.
        push_line(level, &target, &message);
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_targets() {
        assert_eq!(normalize_frontend_target(""), "scribe.fe");
        assert_eq!(normalize_frontend_target("boot"), "scribe.fe.boot");
        assert_eq!(
            normalize_frontend_target("scribe.fe.diagnostics"),
            "scribe.fe.diagnostics"
        );
    }
}
