//! Serializable logging preferences. Keep in sync with FE if mirrored.

use serde::{Deserialize, Serialize};

use crate::level::{level_filter_name, parse_level_filter, resolve_level_from_env};

/// Framework crates that stay quiet unless SCRIBE_RUST_LOG is trace.
pub const DEFAULT_QUIET_TARGETS: [&str; 5] = ["tao", "wry", "hyper", "reqwest", "tracing"];

pub const DEFAULT_RING_CAPACITY: usize = 500;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleLevel {
    pub target: String,
    pub level: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoggingSettings {
    /// Global level name: off | error | warn | info | debug | trace
    pub level: String,
    pub colors: bool,
    /// Write to stderr (true) or stdout (false).
    pub stderr: bool,
    pub timestamps: bool,
    /// Crate name prefixes filtered to warn.
    pub quiet_targets: Vec<String>,
    /// In-memory ring size for Diagnostics.
    #[serde(default = "default_ring_capacity_serde")]
    pub ring_capacity: usize,
    /// Optional log file path (also `SCRIBE_LOG_FILE`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    /// Per-target overrides (applied after quiet_targets).
    #[serde(default)]
    pub module_levels: Vec<ModuleLevel>,
    /// Mirror FE `logging_write` into the ring + terminal (default true).
    #[serde(default = "default_true")]
    pub mirror_frontend: bool,
}

fn default_ring_capacity_serde() -> usize {
    DEFAULT_RING_CAPACITY
}

fn default_true() -> bool {
    true
}

impl Default for LoggingSettings {
    fn default() -> Self {
        default_logging_settings()
    }
}

pub fn default_logging_settings() -> LoggingSettings {
    let file_path = std::env::var("SCRIBE_LOG_FILE")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

    LoggingSettings {
        level: level_filter_name(resolve_level_from_env()).to_string(),
        colors: env_flag_default("SCRIBE_LOG_COLORS", true),
        stderr: env_flag_default("SCRIBE_LOG_STDERR", true),
        timestamps: env_flag_default("SCRIBE_LOG_TIMESTAMPS", true),
        quiet_targets: DEFAULT_QUIET_TARGETS
            .iter()
            .map(|item| (*item).to_string())
            .collect(),
        ring_capacity: env_usize("SCRIBE_LOG_RING", DEFAULT_RING_CAPACITY),
        file_path,
        module_levels: Vec::new(),
        mirror_frontend: env_flag_default("SCRIBE_LOG_MIRROR_FE", true),
    }
}

fn env_flag_default(key: &str, default: bool) -> bool {
    match std::env::var(key) {
        Ok(raw) => {
            let v = raw.trim().to_ascii_lowercase();
            if v.is_empty() {
                return default;
            }
            matches!(v.as_str(), "1" | "true" | "yes" | "on")
        }
        Err(_) => default,
    }
}

fn env_usize(key: &str, default: usize) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(default)
        .clamp(32, 10_000)
}

pub fn normalize_logging_settings(input: LoggingSettings) -> LoggingSettings {
    let level = level_filter_name(parse_level_filter(&input.level)).to_string();
    let quiet_targets: Vec<String> = input
        .quiet_targets
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .fold(Vec::new(), |mut acc, item| {
            if !acc.iter().any(|existing| existing.eq_ignore_ascii_case(&item)) {
                acc.push(item);
            }
            acc
        });

    let module_levels: Vec<ModuleLevel> = input
        .module_levels
        .into_iter()
        .filter_map(|item| {
            let target = item.target.trim().to_string();
            if target.is_empty() {
                return None;
            }
            Some(ModuleLevel {
                target,
                level: level_filter_name(parse_level_filter(&item.level)).to_string(),
            })
        })
        .collect();

    let file_path = input
        .file_path
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty());

    LoggingSettings {
        level,
        colors: input.colors,
        stderr: input.stderr,
        timestamps: input.timestamps,
        quiet_targets: if quiet_targets.is_empty() {
            default_logging_settings().quiet_targets
        } else {
            quiet_targets
        },
        ring_capacity: input.ring_capacity.clamp(32, 10_000),
        file_path,
        module_levels,
        mirror_frontend: input.mirror_frontend,
    }
}

pub fn logging_settings_from_json(raw: &str) -> Result<LoggingSettings, String> {
    let parsed: LoggingSettings =
        serde_json::from_str(raw).map_err(|err| format!("invalid logging settings: {err}"))?;
    Ok(normalize_logging_settings(parsed))
}

pub fn logging_settings_from_env() -> LoggingSettings {
    normalize_logging_settings(default_logging_settings())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_level_and_modules() {
        let mut settings = default_logging_settings();
        settings.level = "DEBUG".into();
        settings.module_levels = vec![ModuleLevel {
            target: "  scribe.db ".into(),
            level: "trace".into(),
        }];
        settings.ring_capacity = 12;
        let next = normalize_logging_settings(settings);
        assert_eq!(next.level, "debug");
        assert_eq!(next.ring_capacity, 32);
        assert_eq!(next.module_levels[0].target, "scribe.db");
        assert!(!next.quiet_targets.is_empty());
    }
}
