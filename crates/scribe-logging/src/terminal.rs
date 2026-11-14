//! Fern-based terminal (+ optional file) logger. Feature: `terminal`.

use std::fs::OpenOptions;
use std::io;
use std::sync::atomic::{AtomicBool, Ordering};

use fern::colors::{Color, ColoredLevelConfig};
use log::LevelFilter;

use crate::buffer::{configure_ring_capacity, RingLogger};
use crate::level::parse_level_filter;
use crate::runtime::{init_runtime_level, level_enabled};
use crate::settings::LoggingSettings;

static TERMINAL_READY: AtomicBool = AtomicBool::new(false);

pub fn terminal_logger_ready() -> bool {
    TERMINAL_READY.load(Ordering::SeqCst)
}

/// Install a global `log` logger that prints to the terminal (+ ring + optional file).
/// Safe to call once; later calls are no-ops (Ok).
pub fn init_terminal_logger(settings: &LoggingSettings) -> Result<(), String> {
    if TERMINAL_READY.load(Ordering::SeqCst) {
        return Ok(());
    }

    let level = parse_level_filter(&settings.level);
    init_runtime_level(level);
    configure_ring_capacity(settings.ring_capacity);
    crate::frontend::set_mirror_frontend(settings.mirror_frontend);

    let colors = ColoredLevelConfig::new()
        .error(Color::BrightRed)
        .warn(Color::Yellow)
        .info(Color::Green)
        .debug(Color::Blue)
        .trace(Color::BrightBlack);

    let use_colors = settings.colors;
    let timestamps = settings.timestamps;
    let mut dispatch = fern::Dispatch::new()
        // Accept everything; runtime + quiet/module filters decide.
        .level(LevelFilter::Trace)
        .filter(|metadata| level_enabled(metadata.level()))
        .format(move |out, message, record| {
            let level_label = if use_colors {
                format!("{}", colors.color(record.level()))
            } else {
                record.level().to_string()
            };
            if timestamps {
                out.finish(format_args!(
                    "{} {:>5} [{}] {}",
                    chrono::Local::now().format("%H:%M:%S%.3f"),
                    level_label,
                    record.target(),
                    message
                ))
            } else {
                out.finish(format_args!(
                    "{:>5} [{}] {}",
                    level_label,
                    record.target(),
                    message
                ))
            }
        });

    for target in &settings.quiet_targets {
        dispatch = dispatch.level_for(target.clone(), LevelFilter::Warn);
    }
    for module in &settings.module_levels {
        dispatch = dispatch.level_for(module.target.clone(), parse_level_filter(&module.level));
    }

    let output: fern::Output = if settings.stderr {
        io::stderr().into()
    } else {
        io::stdout().into()
    };
    dispatch = dispatch.chain(output);

    if let Some(path) = settings.file_path.as_deref() {
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .map_err(|err| format!("could not open log file {path}: {err}"))?;
        dispatch = dispatch.chain(file);
    }

    // In-memory ring for Diagnostics / FE.
    dispatch = dispatch.chain(Box::new(RingLogger) as Box<dyn log::Log>);

    dispatch
        .apply()
        .map_err(|err| format!("could not install terminal logger: {err}"))?;

    TERMINAL_READY.store(true, Ordering::SeqCst);
    Ok(())
}

/// Resolve settings from env and install the terminal logger.
pub fn init_from_env() -> Result<(), String> {
    let settings = crate::settings::logging_settings_from_env();
    init_terminal_logger(&settings)
}
