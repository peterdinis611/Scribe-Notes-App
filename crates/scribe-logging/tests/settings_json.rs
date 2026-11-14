//! Crate-level checks for JSON settings + FE bridge + ring.

use log::Level;
use scribe_logging::{
    clear_logs, configure_ring_capacity, level_filter_name, log_frontend_line, log_stats,
    logging_settings_from_json, normalize_frontend_target, parse_level_filter, push_line,
    recent_logs, set_mirror_frontend, set_runtime_level,
};

#[test]
fn json_settings_and_frontend_bridge() {
    let settings = logging_settings_from_json(
        r#"{
          "level": "debug",
          "colors": true,
          "stderr": true,
          "timestamps": true,
          "quietTargets": ["tao", "wry"],
          "ringCapacity": 64,
          "mirrorFrontend": true,
          "moduleLevels": [{"target": "scribe.ws", "level": "trace"}]
        }"#,
    )
    .expect("settings");
    assert_eq!(settings.level, "debug");
    assert_eq!(settings.ring_capacity, 64);
    assert_eq!(settings.module_levels.len(), 1);

    clear_logs();
    configure_ring_capacity(64);
    set_runtime_level("debug");
    set_mirror_frontend(true);

    push_line(Level::Info, "scribe.integration", "host-line");
    assert!(log_frontend_line("debug", "ipc", "fe-line"));
    assert_eq!(normalize_frontend_target("ipc"), "scribe.fe.ipc");

    let lines = recent_logs(20, Some("debug"), Some("scribe."));
    assert!(lines.iter().any(|l| l.message == "host-line"));
    assert!(lines.iter().any(|l| l.message == "fe-line" && l.target == "scribe.fe.ipc"));

    let stats = log_stats();
    assert!(stats.retained >= 2);
    assert!(stats.total >= 2);

    set_runtime_level("error");
    assert!(!log_frontend_line("info", "ipc", "filtered"));
    set_runtime_level("info");
}

#[test]
fn parse_and_name_roundtrip() {
    assert_eq!(level_filter_name(parse_level_filter("warn")), "warn");
    assert_eq!(parse_level_filter("TRACE"), log::LevelFilter::Trace);
    assert_eq!(parse_level_filter("off"), log::LevelFilter::Off);
}
