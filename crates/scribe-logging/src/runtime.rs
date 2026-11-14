//! Process-wide runtime log level (changeable after fern init).

use std::sync::atomic::{AtomicU8, Ordering};

use log::{Level, LevelFilter};

use crate::level::{level_filter_name, parse_level_filter};

static RUNTIME_LEVEL: AtomicU8 = AtomicU8::new(LevelFilter::Info as u8);

fn filter_to_u8(level: LevelFilter) -> u8 {
    level as u8
}

fn u8_to_filter(raw: u8) -> LevelFilter {
    match raw {
        0 => LevelFilter::Off,
        1 => LevelFilter::Error,
        2 => LevelFilter::Warn,
        3 => LevelFilter::Info,
        4 => LevelFilter::Debug,
        _ => LevelFilter::Trace,
    }
}

pub fn init_runtime_level(level: LevelFilter) {
    RUNTIME_LEVEL.store(filter_to_u8(level), Ordering::SeqCst);
}

pub fn runtime_level() -> LevelFilter {
    u8_to_filter(RUNTIME_LEVEL.load(Ordering::SeqCst))
}

pub fn runtime_level_name() -> &'static str {
    level_filter_name(runtime_level())
}

pub fn set_runtime_level(raw: &str) -> LevelFilter {
    let level = parse_level_filter(raw);
    init_runtime_level(level);
    level
}

pub fn level_enabled(level: Level) -> bool {
    let as_filter = match level {
        Level::Error => LevelFilter::Error,
        Level::Warn => LevelFilter::Warn,
        Level::Info => LevelFilter::Info,
        Level::Debug => LevelFilter::Debug,
        Level::Trace => LevelFilter::Trace,
    };
    as_filter <= runtime_level()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_lock;

    fn with_level(level: &str, body: impl FnOnce()) {
        let _guard = test_lock();
        let previous = runtime_level_name().to_string();
        set_runtime_level(level);
        body();
        set_runtime_level(&previous);
    }

    #[test]
    fn roundtrip_level() {
        with_level("debug", || {
            assert_eq!(runtime_level(), LevelFilter::Debug);
            assert_eq!(runtime_level_name(), "debug");
            assert!(level_enabled(Level::Info));
            assert!(level_enabled(Level::Debug));
            assert!(!level_enabled(Level::Trace));
        });
        with_level("warn", || {
            assert!(!level_enabled(Level::Info));
            assert!(level_enabled(Level::Warn));
            assert!(level_enabled(Level::Error));
        });
    }

    #[test]
    fn off_disables_all() {
        with_level("off", || {
            assert_eq!(runtime_level(), LevelFilter::Off);
            assert!(!level_enabled(Level::Error));
            assert!(!level_enabled(Level::Trace));
        });
    }

    #[test]
    fn trace_enables_all() {
        with_level("trace", || {
            for level in [
                Level::Error,
                Level::Warn,
                Level::Info,
                Level::Debug,
                Level::Trace,
            ] {
                assert!(level_enabled(level), "{level:?}");
            }
        });
    }

    #[test]
    fn init_runtime_level_direct() {
        let _guard = test_lock();
        let previous = runtime_level();
        init_runtime_level(LevelFilter::Error);
        assert_eq!(runtime_level(), LevelFilter::Error);
        assert_eq!(runtime_level_name(), "error");
        init_runtime_level(previous);
    }
}
