//! Watch the documents folder for external changes (iCloud / Dropbox / Finder).

use crate::db::DbState;
use crate::storage;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const DEBOUNCE: Duration = Duration::from_millis(1200);

pub struct DocumentsWatcher {
    enabled: AtomicBool,
    restart: Mutex<Option<mpsc::Sender<()>>>,
}

impl DocumentsWatcher {
    pub fn new() -> Self {
        Self {
            enabled: AtomicBool::new(true),
            restart: Mutex::new(None),
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::SeqCst);
        self.request_restart();
    }

    pub fn request_restart(&self) {
        if let Ok(guard) = self.restart.lock() {
            if let Some(tx) = guard.as_ref() {
                let _ = tx.send(());
            }
        }
    }
}

pub(crate) fn should_ignore_path(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return true;
    };
    if name.starts_with('.') || name == "pdf" || name == "assets" || name == "Backups" {
        return true;
    }
    // Temp write artifacts from Scribe / cloud providers.
    if name.ends_with(".tmp") || name.ends_with(".part") || name.ends_with("~") {
        return true;
    }
    false
}

fn should_ignore(path: &Path) -> bool {
    should_ignore_path(path)
}

fn event_is_interesting(event: &Event) -> bool {
    use notify::EventKind;
    match event.kind {
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) | EventKind::Any => {
            event.paths.iter().any(|path| !should_ignore(path))
        }
        _ => false,
    }
}

fn current_documents_dir(app: &AppHandle) -> Option<PathBuf> {
    let state = app.try_state::<DbState>()?;
    let conn = state.conn.lock().ok()?;
    storage::get_documents_dir(app, &conn).ok()
}

fn run_reconcile_and_emit(app: &AppHandle) {
    let Some(state) = app.try_state::<DbState>() else {
        return;
    };
    let Ok(conn) = state.conn.lock() else {
        return;
    };
    match storage::reconcile_storage(app, &conn) {
        Ok(result) => {
            let pulled = result.updated_from_disk_count > 0 || result.imported_count > 0;
            if pulled || result.conflict_count > 0 {
                let _ = app.emit("disk-changed", &result);
            }
        }
        Err(error) => log::warn!("FS watch reconcile failed: {error}"),
    }
}

pub fn spawn(app: AppHandle) -> Arc<DocumentsWatcher> {
    let watcher_state = Arc::new(DocumentsWatcher::new());
    let (restart_tx, restart_rx) = mpsc::channel::<()>();
    if let Ok(mut guard) = watcher_state.restart.lock() {
        *guard = Some(restart_tx);
    }

    let state_for_thread = Arc::clone(&watcher_state);
    thread::Builder::new()
        .name("scribe-docs-watch".into())
        .spawn(move || {
            loop {
                if !state_for_thread.enabled.load(Ordering::SeqCst) {
                    // Sleep until restart signal toggles enabled back on.
                    let _ = restart_rx.recv_timeout(Duration::from_secs(30));
                    continue;
                }

                let Some(dir) = current_documents_dir(&app) else {
                    let _ = restart_rx.recv_timeout(Duration::from_secs(15));
                    continue;
                };

                let (event_tx, event_rx) = mpsc::channel();
                let mut watcher = match RecommendedWatcher::new(
                    move |res| {
                        let _ = event_tx.send(res);
                    },
                    notify::Config::default(),
                ) {
                    Ok(w) => w,
                    Err(error) => {
                        log::warn!("Documents watcher failed to start: {error}");
                        let _ = restart_rx.recv_timeout(Duration::from_secs(30));
                        continue;
                    }
                };

                if let Err(error) = watcher.watch(&dir, RecursiveMode::Recursive) {
                    log::warn!("Documents watcher could not watch {}: {error}", dir.display());
                    let _ = restart_rx.recv_timeout(Duration::from_secs(30));
                    continue;
                }

                log::info!("Watching documents folder: {}", dir.display());
                let mut last_fire: Option<Instant> = None;
                let mut pending = false;

                loop {
                    // Prefer restart → rebuild watcher (dir changed / toggled).
                    match restart_rx.recv_timeout(Duration::from_millis(400)) {
                        Ok(()) => break,
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                        Err(mpsc::RecvTimeoutError::Disconnected) => return,
                    }

                    while let Ok(msg) = event_rx.try_recv() {
                        match msg {
                            Ok(event) if event_is_interesting(&event) => pending = true,
                            Ok(_) => {}
                            Err(error) => log::debug!("Watch event error: {error}"),
                        }
                    }

                    if pending {
                        let now = Instant::now();
                        let ready = last_fire
                            .map(|at| now.duration_since(at) >= DEBOUNCE)
                            .unwrap_or(true);
                        if ready {
                            pending = false;
                            last_fire = Some(now);
                            if state_for_thread.enabled.load(Ordering::SeqCst) {
                                run_reconcile_and_emit(&app);
                            }
                        }
                    }
                }
            }
        })
        .ok();

    watcher_state
}

#[cfg(test)]
mod tests {
    use super::should_ignore_path;
    use std::path::Path;

    #[test]
    fn ignores_dotfiles_and_sidecar_dirs() {
        assert!(should_ignore_path(Path::new("/docs/.DS_Store")));
        assert!(should_ignore_path(Path::new("/docs/pdf")));
        assert!(should_ignore_path(Path::new("/docs/assets")));
        assert!(should_ignore_path(Path::new("/docs/Backups")));
    }

    #[test]
    fn ignores_temp_write_artifacts() {
        assert!(should_ignore_path(Path::new("/docs/note.scribe.tmp")));
        assert!(should_ignore_path(Path::new("/docs/note.scribe.part")));
        assert!(should_ignore_path(Path::new("/docs/note~")));
    }

    #[test]
    fn keeps_real_scribe_files() {
        assert!(!should_ignore_path(Path::new("/docs/Meeting.scribe")));
        assert!(!should_ignore_path(Path::new("/docs/folder/note.scribe.json")));
    }
}
