//! Local LAN capture server — phone opens a QR URL and posts notes into Inbox.

mod html;
mod server;

use serde::{Deserialize, Serialize};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::db::DbState;
use server::handle_connection;

const DEFAULT_PORT: u16 = 17_847;
const INBOX_FOLDER_NAME: &str = "Inbox";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
    pub token: Option<String>,
    pub lan_ip: Option<String>,
    pub inbox_folder_id: Option<String>,
}

struct CaptureRuntime {
    token: String,
    port: u16,
    url: String,
    lan_ip: String,
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

fn detect_lan_ip() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        for iface in ["en0", "en1", "en2", "bridge0"] {
            if let Ok(output) = std::process::Command::new("ipconfig")
                .args(["getifaddr", iface])
                .output()
            {
                if output.status.success() {
                    let ip = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !ip.is_empty() && ip.contains('.') {
                        return Some(ip);
                    }
                }
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Best-effort: first non-loopback IPv4 from hostname resolution is unreliable;
        // try common env / leave None so UI can show localhost warning.
        let _ = ();
    }
    None
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
        // Pre-migration fallback without vault columns.
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureCreated {
    pub document_id: String,
    pub title: String,
    pub folder_id: String,
}

use rusqlite::OptionalExtension;

#[tauri::command]
pub fn capture_status(state: State<'_, CaptureServerState>) -> Result<CaptureStatus, String> {
    let guard = state.inner.lock().map_err(|e| e.to_string())?;
    Ok(match guard.as_ref() {
        Some(runtime) => CaptureStatus {
            running: true,
            port: Some(runtime.port),
            url: Some(runtime.url.clone()),
            token: Some(runtime.token.clone()),
            lan_ip: Some(runtime.lan_ip.clone()),
            inbox_folder_id: None,
        },
        None => CaptureStatus {
            running: false,
            port: None,
            url: None,
            token: None,
            lan_ip: detect_lan_ip(),
            inbox_folder_id: None,
        },
    })
}

#[tauri::command]
pub fn capture_start(
    app: AppHandle,
    state: State<'_, CaptureServerState>,
    db: State<'_, DbState>,
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

    let token = Uuid::new_v4().to_string().replace('-', "");
    let listener = TcpListener::bind(("0.0.0.0", DEFAULT_PORT))
        .or_else(|_| TcpListener::bind(("0.0.0.0", 0)))
        .map_err(|e| format!("Could not bind capture port: {e}"))?;
    listener
        .set_nonblocking(false)
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let lan_ip = detect_lan_ip().unwrap_or_else(|| "127.0.0.1".to_string());
    let url = format!("http://{lan_ip}:{port}/?token={token}");

    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = Arc::clone(&stop);
    let token_thread = token.clone();
    let app_thread = app.clone();

    // Accept loop in a dedicated thread. Use a short read timeout via another
    // thread that connects to unblock accept on stop — simpler: set read timeout
    // on the listener by using non-blocking + sleep, or just leave until stop
    // connects. We'll shut down by connecting once after setting the flag.
    let join = std::thread::spawn(move || {
        listener
            .set_nonblocking(true)
            .ok();
        while !stop_thread.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    handle_connection(stream, &app_thread, &token_thread);
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(80));
                }
                Err(_) => break,
            }
        }
    });

    let runtime = CaptureRuntime {
        token: token.clone(),
        port,
        url: url.clone(),
        lan_ip: lan_ip.clone(),
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
        lan_ip: Some(lan_ip),
        inbox_folder_id: None,
    })
}

#[tauri::command]
pub fn capture_stop(state: State<'_, CaptureServerState>) -> Result<CaptureStatus, String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(mut runtime) = guard.take() {
        runtime.stop.store(true, Ordering::SeqCst);
        // Unblock accept by connecting to self.
        let _ = std::net::TcpStream::connect(("127.0.0.1", runtime.port));
        if let Some(join) = runtime.join.take() {
            let _ = join.join();
        }
    }
    Ok(CaptureStatus {
        running: false,
        port: None,
        url: None,
        token: None,
        lan_ip: detect_lan_ip(),
        inbox_folder_id: None,
    })
}
