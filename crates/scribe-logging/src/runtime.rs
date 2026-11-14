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

    #[test]
    fn roundtrip_level() {
        set_runtime_level("debug");
        assert_eq!(runtime_level(), LevelFilter::Debug);
        assert!(level_enabled(Level::Info));
        assert!(level_enabled(Level::Debug));
        set_runtime_level("warn");
        assert!(!level_enabled(Level::Info));
        assert!(level_enabled(Level::Warn));
        set_runtime_level("info");
    }
}
