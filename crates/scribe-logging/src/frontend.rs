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
    use crate::buffer::{clear_logs, configure_ring_capacity, recent_logs};
    use crate::runtime::set_runtime_level;
    use crate::test_lock;

    #[test]
    fn normalizes_targets() {
        assert_eq!(normalize_frontend_target(""), "scribe.fe");
        assert_eq!(normalize_frontend_target("..."), "scribe.fe");
        assert_eq!(normalize_frontend_target("boot"), "scribe.fe.boot");
        assert_eq!(
            normalize_frontend_target("scribe.fe.diagnostics"),
            "scribe.fe.diagnostics"
        );
        // Non-ascii-id chars become `_`; trailing `_` is trimmed.
        assert_eq!(normalize_frontend_target("ipc/save !!"), "scribe.fe.ipc_save");
        assert_eq!(normalize_frontend_target("a b"), "scribe.fe.a_b");
        assert_eq!(
            normalize_frontend_target("scribe.db"),
            "scribe.db"
        );
    }

    #[test]
    fn log_frontend_line_writes_ring_when_logger_absent() {
        let _guard = test_lock();
        clear_logs();
        configure_ring_capacity(64);
        set_mirror_frontend(true);
        set_runtime_level("info");
        assert!(log_frontend_line("info", "boot", "hello from fe"));
        let lines = recent_logs(5, None, Some("scribe.fe.boot"));
        assert_eq!(lines.last().map(|l| l.message.as_str()), Some("hello from fe"));
    }

    #[test]
    fn rejects_empty_off_and_disabled_mirror() {
        let _guard = test_lock();
        set_mirror_frontend(true);
        set_runtime_level("info");
        assert!(!log_frontend_line("info", "boot", "   "));
        assert!(!log_frontend_line("off", "boot", "nope"));
        set_mirror_frontend(false);
        assert!(!log_frontend_line("error", "boot", "blocked"));
        assert!(!mirror_frontend_enabled());
        set_mirror_frontend(true);
    }

    #[test]
    fn respects_runtime_level() {
        let _guard = test_lock();
        clear_logs();
        configure_ring_capacity(64);
        set_mirror_frontend(true);
        let previous = crate::runtime::runtime_level_name().to_string();
        set_runtime_level("error");
        assert!(!log_frontend_line("info", "boot", "too quiet"));
        assert!(log_frontend_line("error", "boot", "loud"));
        set_runtime_level(&previous);
    }

    #[test]
    fn truncates_frontend_payload() {
        let _guard = test_lock();
        clear_logs();
        configure_ring_capacity(64);
        set_mirror_frontend(true);
        set_runtime_level("info");
        let long = "y".repeat(5000);
        assert!(log_frontend_line("warn", "diagnostics", &long));
        let line = recent_logs(1, None, Some("scribe.fe.diagnostics"))
            .pop()
            .unwrap();
        assert!(line.message.len() <= 4000);
        assert!(line.message.ends_with('…'));
    }
}
