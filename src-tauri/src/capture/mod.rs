//! Local LAN capture server — phone opens a QR URL and posts notes into Inbox.
//!
//! HTTP protocol + HTML live in [`scribe_capture`]; this module owns Tauri lifecycle,
//! security sessions, and Inbox DB inserts.

use serde_json::json;
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::db::DbState;
use crate::security::{
    log_security, RateLimiter, TokenSession, CAPTURE_IDLE_STOP, CAPTURE_TOKEN_TTL,
};
use rusqlite::OptionalExtension;
use scribe_capture::{
    detect_lan_ip, handle_connection, CaptureCreated, CaptureInbox, CaptureRateLimit,
    CaptureStatus, CaptureTokenAuth, DEFAULT_PORT, INBOX_FOLDER_NAME,
};

struct CaptureRuntime {
    session: Arc<TokenSession>,
    #[allow(dead_code)]
    form_nonce: Arc<Mutex<Option<String>>>,
    #[allow(dead_code)]
    last_activity: Arc<Mutex<Instant>>,
    port: u16,
    url: String,
    lan_ip: String,
    allow_lan: bool,
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

pub struct CaptureServerState {
    inner: Mutex<Option<CaptureRuntime>>,
}

impl CaptureServerState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

fn ensure_inbox_folder(conn: &rusqlite::Connection) -> Result<String, String> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM folders WHERE parent_id IS NULL AND (name = ?1 OR name = 'Schránka') LIMIT 1",
            rusqlite::params![INBOX_FOLDER_NAME],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(id) = existing {
        return Ok(id);
    }

    let mut id = Uuid::new_v4().to_string();
    let now = now_ts();
    let insert = conn.execute(
        "INSERT INTO folders (id, name, parent_id, created_at, updated_at, is_vault, vault_verifier) \
         VALUES (?1, ?2, NULL, ?3, ?3, 0, NULL)",
        rusqlite::params![id, INBOX_FOLDER_NAME, now],
    );
    if insert.is_err() {
        id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO folders (id, name, parent_id, created_at, updated_at) \
             VALUES (?1, ?2, NULL, ?3, ?3)",
            rusqlite::params![id, INBOX_FOLDER_NAME, now],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(id)
}

struct AppCaptureInbox {
    app: AppHandle,
}

impl CaptureInbox for AppCaptureInbox {
    fn create_note(&self, title: &str, body: &str) -> Result<CaptureCreated, String> {
        create_inbox_note(&self.app, title, body)
    }
}

impl CaptureTokenAuth for TokenSession {
    fn is_valid(&self, token: &str) -> bool {
        TokenSession::is_valid(self, token)
    }
}

impl CaptureRateLimit for RateLimiter {
    fn check(&self, client_key: &str) -> bool {
        RateLimiter::check(self, client_key)
    }
}

pub(crate) fn create_inbox_note(
    app: &AppHandle,
    title: &str,
    body: &str,
) -> Result<CaptureCreated, String> {
    let state = app.state::<DbState>();
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let folder_id = ensure_inbox_folder(&conn)?;
    let id = Uuid::new_v4().to_string();
    let now = now_ts();
    let title = {
        let trimmed = title.trim();
        if trimmed.is_empty() {
            let stamp = chrono::Local::now().format("%Y-%m-%d %H:%M");
            format!("Capture · {stamp}")
        } else {
            trimmed.to_string()
        }
    };
    let content_json = scribe_core::plain_text::plain_text_to_tiptap(body, None);

    crate::commands::documents::insert_document_record(
        &conn,
        &id,
        &title,
        &content_json,
        Some(folder_id.clone()),
        now,
    )?;

    if let Err(error) = crate::commands::storage::queue_document_persist(
        app,
        &conn,
        &state.persist_queue,
        &id,
        &title,
        &content_json,
        now,
        now,
    ) {
        state.persist_queue.record_error(&id, error);
    }

    let created = CaptureCreated {
        document_id: id,
        title,
        folder_id,
    };
    let _ = app.emit("mobile-capture", &created);
    Ok(created)
}

#[tauri::command]
pub fn capture_status(state: State<'_, CaptureServerState>) -> Result<CaptureStatus, String> {
    let guard = state.inner.lock().map_err(|e| e.to_string())?;
    Ok(match guard.as_ref() {
        Some(runtime) => CaptureStatus {
            running: true,
            port: Some(runtime.port),
            url: Some(runtime.url.clone()),
            token: Some(runtime.session.token()),
            token_expires_at: Some(runtime.session.expires_unix()),
            lan_ip: Some(runtime.lan_ip.clone()),
            allow_lan: runtime.allow_lan,
            inbox_folder_id: None,
        },
        None => CaptureStatus::idle(detect_lan_ip()),
    })
}

#[tauri::command]
pub fn capture_start(
    app: AppHandle,
    state: State<'_, CaptureServerState>,
    db: State<'_, DbState>,
    allow_lan: Option<bool>,
) -> Result<CaptureStatus, String> {
    {
        let guard = state.inner.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            drop(guard);
            return capture_status(state);
        }
    }

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let _ = ensure_inbox_folder(&conn)?;
    }

    let allow_lan = allow_lan.unwrap_or(false);
    let token = Uuid::new_v4().to_string().replace('-', "");
    let session = Arc::new(TokenSession::new(token.clone(), CAPTURE_TOKEN_TTL));
    let form_nonce = Arc::new(Mutex::new(None::<String>));
    let last_activity = Arc::new(Mutex::new(Instant::now()));
    let limiter = Arc::new(RateLimiter::new());
    let bind_host = if allow_lan { "0.0.0.0" } else { "127.0.0.1" };
    let listener = TcpListener::bind((bind_host, DEFAULT_PORT))
        .or_else(|_| TcpListener::bind((bind_host, 0)))
        .map_err(|e| format!("Could not bind capture port: {e}"))?;
    listener
        .set_nonblocking(false)
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let display_host = if allow_lan {
        detect_lan_ip().unwrap_or_else(|| "127.0.0.1".to_string())
    } else {
        "127.0.0.1".to_string()
    };
    let url = format!("http://{display_host}:{port}/#t={token}");

    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = Arc::clone(&stop);
    let session_thread = Arc::clone(&session);
    let form_nonce_thread = Arc::clone(&form_nonce);
    let last_activity_thread = Arc::clone(&last_activity);
    let limiter_thread = Arc::clone(&limiter);
    let app_thread = app.clone();

    let join = std::thread::spawn(move || {
        listener.set_nonblocking(true).ok();
        let inbox = AppCaptureInbox {
            app: app_thread.clone(),
        };
        while !stop_thread.load(Ordering::SeqCst) {
            if let Ok(last) = last_activity_thread.lock() {
                if last.elapsed() >= CAPTURE_IDLE_STOP {
                    log::info!("Capture idle timeout — stopping server");
                    stop_thread.store(true, Ordering::SeqCst);
                    break;
                }
            }
            match listener.accept() {
                Ok((stream, peer)) => {
                    let _ = stream.set_nonblocking(false);
                    handle_connection(
                        stream,
                        Some(peer),
                        &inbox,
                        session_thread.as_ref(),
                        limiter_thread.as_ref(),
                        &form_nonce_thread,
                        &last_activity_thread,
                    );
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(80));
                }
                Err(_) => break,
            }
        }
    });

    log_security(
        &app,
        "capture_start",
        if allow_lan {
            "Mobile capture started (LAN)"
        } else {
            "Mobile capture started (localhost)"
        },
        Some(json!({
            "port": port,
            "allowLan": allow_lan,
            "ttlSec": CAPTURE_TOKEN_TTL.as_secs(),
        })),
        "ok",
    );

    let runtime = CaptureRuntime {
        session: Arc::clone(&session),
        form_nonce,
        last_activity,
        port,
        url: url.clone(),
        lan_ip: display_host.clone(),
        allow_lan,
        stop,
        join: Some(join),
    };

    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = Some(runtime);

    Ok(CaptureStatus {
        running: true,
        port: Some(port),
        url: Some(url),
        token: Some(token),
        token_expires_at: Some(session.expires_unix()),
        lan_ip: Some(display_host),
        allow_lan,
        inbox_folder_id: None,
    })
}

#[tauri::command]
pub fn capture_stop(state: State<'_, CaptureServerState>) -> Result<CaptureStatus, String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(mut runtime) = guard.take() {
        runtime.stop.store(true, Ordering::SeqCst);
        let _ = std::net::TcpStream::connect(("127.0.0.1", runtime.port));
        if let Some(join) = runtime.join.take() {
            let _ = join.join();
        }
    }
    Ok(CaptureStatus::idle(detect_lan_ip()))
}
