//! Resolve log level from `SCRIBE_RUST_LOG` / `RUST_LOG` / `SCRIBE_DEBUG`.

use log::LevelFilter;

/// Env vars checked in order (first non-empty wins).
pub const ENV_KEYS: [&str; 3] = ["SCRIBE_RUST_LOG", "RUST_LOG", "SCRIBE_DEBUG"];

pub fn level_filter_name(level: LevelFilter) -> &'static str {
    match level {
        LevelFilter::Off => "off",
        LevelFilter::Error => "error",
        LevelFilter::Warn => "warn",
        LevelFilter::Info => "info",
        LevelFilter::Debug => "debug",
        LevelFilter::Trace => "trace",
    }
}

pub fn parse_level_filter(raw: &str) -> LevelFilter {
    let raw = raw.trim().to_ascii_lowercase();
    if raw.is_empty() {
        return LevelFilter::Info;
    }
    if raw == "off" || raw == "0" || raw == "false" || raw == "no" {
        return LevelFilter::Off;
    }
    if raw == "1" || raw == "true" || raw == "yes" || raw == "on" || raw == "debug" {
        return LevelFilter::Debug;
    }
    if raw == "trace" {
        return LevelFilter::Trace;
    }
    if raw == "warn" || raw == "warning" {
        return LevelFilter::Warn;
    }
    if raw == "error" {
        return LevelFilter::Error;
    }
    if raw == "info" {
        return LevelFilter::Info;
    }
    // Values like `scribe=debug,tao=warn` — pick the most verbose keyword.
    if raw.contains("trace") {
        return LevelFilter::Trace;
    }
    if raw.contains("debug") {
        return LevelFilter::Debug;
    }
    if raw.contains("warn") {
        return LevelFilter::Warn;
    }
    if raw.contains("error") {
        return LevelFilter::Error;
    }
    LevelFilter::Info
}

/// Read level from process environment.
pub fn resolve_level_from_env() -> LevelFilter {
    for key in ENV_KEYS {
        if let Ok(raw) = std::env::var(key) {
            if !raw.trim().is_empty() {
                return parse_level_filter(&raw);
            }
        }
    }
    LevelFilter::Info
}

pub fn nlp_debug_enabled() -> bool {
    std::env::var("SCRIBE_NLP_DEBUG")
        .map(|value| {
            let value = value.to_ascii_lowercase();
            value == "1" || value == "true" || value == "yes" || value == "on" || value == "debug"
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_aliases() {
        assert_eq!(parse_level_filter("debug"), LevelFilter::Debug);
        assert_eq!(parse_level_filter("1"), LevelFilter::Debug);
        assert_eq!(parse_level_filter("trace"), LevelFilter::Trace);
        assert_eq!(parse_level_filter("warn"), LevelFilter::Warn);
        assert_eq!(parse_level_filter("scribe=debug,tao=warn"), LevelFilter::Debug);
        assert_eq!(parse_level_filter(""), LevelFilter::Info);
    }
}
