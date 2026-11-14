//! In-memory ring of recent log lines (for Diagnostics / FE).

use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};

use log::{Level, Record};
use serde::{Deserialize, Serialize};

use crate::level::level_filter_name;
use crate::settings::DEFAULT_RING_CAPACITY;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub seq: u64,
    pub ts_ms: u64,
    pub level: String,
    pub target: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogStats {
    pub total: u64,
    pub error: u64,
    pub warn: u64,
    pub info: u64,
    pub debug: u64,
    pub trace: u64,
    pub capacity: usize,
    pub retained: usize,
}

struct RingState {
    capacity: usize,
    next_seq: u64,
    lines: VecDeque<LogLine>,
    stats: LogStats,
}

impl RingState {
    fn new(capacity: usize) -> Self {
        let capacity = capacity.clamp(32, 10_000);
        Self {
            capacity,
            next_seq: 1,
            lines: VecDeque::with_capacity(capacity),
            stats: LogStats {
                capacity,
                ..LogStats::default()
            },
        }
    }

    fn push(&mut self, level: Level, target: &str, message: &str) {
        let ts_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let line = LogLine {
            seq: self.next_seq,
            ts_ms,
            level: level_filter_name(level.to_level_filter()).to_string(),
            target: target.to_string(),
            message: truncate_message(message),
        };
        self.next_seq = self.next_seq.saturating_add(1);
        self.stats.total = self.stats.total.saturating_add(1);
        match level {
            Level::Error => self.stats.error = self.stats.error.saturating_add(1),
            Level::Warn => self.stats.warn = self.stats.warn.saturating_add(1),
            Level::Info => self.stats.info = self.stats.info.saturating_add(1),
            Level::Debug => self.stats.debug = self.stats.debug.saturating_add(1),
            Level::Trace => self.stats.trace = self.stats.trace.saturating_add(1),
        }
        if self.lines.len() >= self.capacity {
            self.lines.pop_front();
        }
        self.lines.push_back(line);
        self.stats.retained = self.lines.len();
        self.stats.capacity = self.capacity;
    }

    fn recent(&self, limit: usize, min_level: Option<Level>, target_prefix: Option<&str>) -> Vec<LogLine> {
        let limit = if limit == 0 { self.capacity } else { limit.min(self.capacity) };
        self.lines
            .iter()
            .rev()
            .filter(|line| {
                if let Some(min) = min_level {
                    let Ok(level) = line.level.parse::<Level>() else {
                        return false;
                    };
                    // log::Level: Error=1 … Trace=5 — keep lines at or above min severity.
                    if level > min {
                        return false;
                    }
                }
                if let Some(prefix) = target_prefix {
                    if !prefix.is_empty() && !line.target.starts_with(prefix) {
                        return false;
                    }
                }
                true
            })
            .take(limit)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect()
    }

    fn clear(&mut self) {
        self.lines.clear();
        self.stats.retained = 0;
    }

    fn set_capacity(&mut self, capacity: usize) {
        self.capacity = capacity.clamp(32, 10_000);
        self.stats.capacity = self.capacity;
        while self.lines.len() > self.capacity {
            self.lines.pop_front();
        }
        self.stats.retained = self.lines.len();
    }
}

fn truncate_message(message: &str) -> String {
    let trimmed = message.trim_end();
    if trimmed.len() <= 4000 {
        trimmed.to_string()
    } else {
        format!("{}…", &trimmed[..3997])
    }
}

fn ring() -> &'static Mutex<RingState> {
    static RING: OnceLock<Mutex<RingState>> = OnceLock::new();
    RING.get_or_init(|| Mutex::new(RingState::new(DEFAULT_RING_CAPACITY)))
}

pub fn configure_ring_capacity(capacity: usize) {
    if let Ok(mut guard) = ring().lock() {
        guard.set_capacity(capacity);
    }
}

pub fn push_record(record: &Record<'_>) {
    let message = record.args().to_string();
    push_line(record.level(), record.target(), &message);
}

pub fn push_line(level: Level, target: &str, message: &str) {
    if let Ok(mut guard) = ring().lock() {
        guard.push(level, target, message);
    }
}

pub fn recent_logs(limit: usize, min_level: Option<&str>, target_prefix: Option<&str>) -> Vec<LogLine> {
    let min = min_level.and_then(|raw| raw.parse::<Level>().ok());
    match ring().lock() {
        Ok(guard) => guard.recent(limit, min, target_prefix),
        Err(_) => Vec::new(),
    }
}

pub fn clear_logs() {
    if let Ok(mut guard) = ring().lock() {
        guard.clear();
    }
}

pub fn log_stats() -> LogStats {
    match ring().lock() {
        Ok(guard) => guard.stats.clone(),
        Err(_) => LogStats::default(),
    }
}

/// Custom `log::Log` sink that only fills the ring (chained from fern).
pub struct RingLogger;

impl log::Log for RingLogger {
    fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
        crate::runtime::level_enabled(metadata.level())
    }

    fn log(&self, record: &Record<'_>) {
        if self.enabled(record.metadata()) {
            push_record(record);
        }
    }

    fn flush(&self) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ring_retains_and_filters() {
        clear_logs();
        configure_ring_capacity(64);
        push_line(Level::Info, "scribe.test", "one");
        push_line(Level::Warn, "scribe.test", "two");
        push_line(Level::Error, "other", "three");
        let all = recent_logs(10, None, None);
        assert!(all.len() >= 3);
        let warns = recent_logs(10, Some("warn"), Some("scribe."));
        assert!(warns.iter().all(|l| l.level == "warn" || l.level == "error"));
        assert!(warns.iter().all(|l| l.target.starts_with("scribe.")));
        let stats = log_stats();
        assert!(stats.total >= 3);
        clear_logs();
        assert_eq!(log_stats().retained, 0);
    }
}
