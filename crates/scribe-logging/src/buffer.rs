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
    use crate::test_lock;
    use log::Log;

    fn reset_ring(capacity: usize) {
        clear_logs();
        configure_ring_capacity(capacity);
        clear_logs();
    }

    #[test]
    fn ring_retains_and_filters() {
        let _guard = test_lock();
        reset_ring(64);
        push_line(Level::Info, "scribe.test", "one");
        push_line(Level::Warn, "scribe.test", "two");
        push_line(Level::Error, "other", "three");
        let all = recent_logs(10, None, None);
        assert_eq!(all.len(), 3);
        assert_eq!(all[0].message, "one");
        assert_eq!(all[2].message, "three");
        let warns = recent_logs(10, Some("warn"), Some("scribe."));
        assert_eq!(warns.len(), 1);
        assert_eq!(warns[0].level, "warn");
        assert_eq!(warns[0].message, "two");
        assert!(warns.iter().all(|l| l.target.starts_with("scribe.")));
        let errors = recent_logs(10, Some("error"), None);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].message, "three");
        let stats = log_stats();
        assert_eq!(stats.retained, 3);
        assert!(stats.info >= 1);
        assert!(stats.warn >= 1);
        assert!(stats.error >= 1);
        let total_before_clear = stats.total;
        clear_logs();
        assert_eq!(log_stats().retained, 0);
        // totals keep counting across clear
        assert_eq!(log_stats().total, total_before_clear);
    }

    #[test]
    fn ring_evicts_oldest_when_full() {
        let _guard = test_lock();
        reset_ring(32);
        for i in 0..40 {
            push_line(Level::Info, "scribe.evict", &format!("msg-{i}"));
        }
        let lines = recent_logs(100, None, None);
        assert_eq!(lines.len(), 32);
        assert_eq!(lines.first().unwrap().message, "msg-8");
        assert_eq!(lines.last().unwrap().message, "msg-39");
        assert_eq!(log_stats().retained, 32);
        assert_eq!(log_stats().capacity, 32);
    }

    #[test]
    fn truncates_long_messages() {
        let _guard = test_lock();
        reset_ring(64);
        let long = "x".repeat(5000);
        push_line(Level::Info, "scribe.long", &long);
        let line = recent_logs(1, None, None).pop().unwrap();
        assert!(line.message.len() <= 4000);
        assert!(line.message.ends_with('…'));
    }

    #[test]
    fn limit_zero_returns_up_to_capacity() {
        let _guard = test_lock();
        reset_ring(32);
        for i in 0..10 {
            push_line(Level::Debug, "scribe.limit", &format!("{i}"));
        }
        let lines = recent_logs(0, None, Some("scribe.limit"));
        assert_eq!(lines.len(), 10);
    }

    #[test]
    fn sequential_ids_increase() {
        let _guard = test_lock();
        reset_ring(64);
        push_line(Level::Info, "scribe.seq", "a");
        push_line(Level::Info, "scribe.seq", "b");
        let lines = recent_logs(10, None, Some("scribe.seq"));
        assert!(lines[1].seq > lines[0].seq);
        assert!(lines[0].ts_ms > 0);
    }

    #[test]
    fn shrinking_capacity_drops_oldest() {
        let _guard = test_lock();
        reset_ring(64);
        for i in 0..50 {
            push_line(Level::Info, "scribe.shrink", &format!("{i}"));
        }
        configure_ring_capacity(32);
        assert_eq!(log_stats().retained, 32);
        assert_eq!(log_stats().capacity, 32);
        let lines = recent_logs(100, None, Some("scribe.shrink"));
        assert_eq!(lines.first().unwrap().message, "18");
    }

    #[test]
    fn serde_log_line_camel_case() {
        let line = LogLine {
            seq: 7,
            ts_ms: 1_700_000_000_000,
            level: "info".into(),
            target: "scribe.test".into(),
            message: "hi".into(),
        };
        let json = serde_json::to_string(&line).unwrap();
        assert!(json.contains("\"tsMs\""));
        assert!(json.contains("\"seq\":7"));
        let back: LogLine = serde_json::from_str(&json).unwrap();
        assert_eq!(back, line);
    }

    #[test]
    fn ring_logger_respects_runtime_level() {
        let _guard = test_lock();
        reset_ring(64);
        let previous = crate::runtime::runtime_level_name().to_string();
        crate::runtime::set_runtime_level("warn");
        let logger = RingLogger;
        let meta_info = log::Metadata::builder()
            .level(Level::Info)
            .target("scribe.ring")
            .build();
        assert!(!logger.enabled(&meta_info));
        let meta_warn = log::Metadata::builder()
            .level(Level::Warn)
            .target("scribe.ring")
            .build();
        assert!(logger.enabled(&meta_warn));
        crate::runtime::set_runtime_level(&previous);
    }
}
