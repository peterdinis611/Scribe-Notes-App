//! Local WebSocket host — lifecycle, token session, and accept loop.
//!
//! Protocol + `handle_connection` live in [`scribe_websockets`]; this module owns
//! Tauri start/stop/status and fans out via [`SharedHub`].

use serde_json::json;
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::security::{log_security, RateLimiter, TokenSession, WEBSOCKET_TOKEN_TTL};
use scribe_websockets::{
    default_websocket_settings, handle_connection, normalize_websocket_settings, websocket_url,
    Hub, SharedHub, WebsocketServerStatus, WebsocketSettings, WebsocketTokenAuth,
    WebsocketRateLimit, DEFAULT_PORT,
};

struct WebsocketRuntime {
    session: Arc<TokenSession>,
    hub: SharedHub,
    settings: WebsocketSettings,
    port: u16,
    url: String,
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

pub struct WebsocketServerState {
    inner: Mutex<Option<WebsocketRuntime>>,
}

impl WebsocketServerState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    /// Shared hub for hosts that want to push events while the server is running.
    #[allow(dead_code)]
    pub fn hub(&self) -> Option<SharedHub> {
        self.inner
            .lock()
            .ok()
            .and_then(|guard| guard.as_ref().map(|runtime| Arc::clone(&runtime.hub)))
    }
}

impl WebsocketTokenAuth for TokenSession {
    fn is_valid(&self, token: &str) -> bool {
        TokenSession::is_valid(self, token)
    }
}

impl WebsocketRateLimit for RateLimiter {
    fn check(&self, client_key: &str) -> bool {
        RateLimiter::check(self, client_key)
    }
}

fn status_from_runtime(runtime: &WebsocketRuntime) -> WebsocketServerStatus {
    WebsocketServerStatus {
        running: true,
        port: Some(runtime.port),
        url: Some(runtime.url.clone()),
        token: Some(runtime.session.token()),
        token_expires_at: Some(runtime.session.expires_unix()),
        connection_count: runtime.hub.connection_count(),
        settings_enabled: runtime.settings.enabled,
    }
}

#[tauri::command]
pub fn websockets_status(
    state: State<'_, WebsocketServerState>,
) -> Result<WebsocketServerStatus, String> {
    let guard = state.inner.lock().map_err(|e| e.to_string())?;
    Ok(match guard.as_ref() {
        Some(runtime) => status_from_runtime(runtime),
        None => WebsocketServerStatus::idle(false),
    })
}

#[tauri::command]
pub fn websockets_start(
    app: AppHandle,
    state: State<'_, WebsocketServerState>,
    settings: Option<WebsocketSettings>,
) -> Result<WebsocketServerStatus, String> {
    {
        let guard = state.inner.lock().map_err(|e| e.to_string())?;
        if let Some(runtime) = guard.as_ref() {
            return Ok(status_from_runtime(runtime));
        }
    }

    let mut settings = normalize_websocket_settings(settings.unwrap_or_else(default_websocket_settings));
    settings.enabled = true;

    let token = Uuid::new_v4().to_string().replace('-', "");
    let session = Arc::new(TokenSession::new(token.clone(), WEBSOCKET_TOKEN_TTL));
    let limiter = Arc::new(RateLimiter::new());
    let hub: SharedHub = Arc::new(Hub::new());

    let bind_host = settings.bind_host.clone();
    let listener = TcpListener::bind((bind_host.as_str(), settings.port))
        .or_else(|_| TcpListener::bind((bind_host.as_str(), 0)))
        .or_else(|_| TcpListener::bind((bind_host.as_str(), DEFAULT_PORT)))
        .map_err(|e| format!("Could not bind websocket port: {e}"))?;
    listener
        .set_nonblocking(false)
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    settings.port = port;
    let url = websocket_url(&settings);

    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = Arc::clone(&stop);
    let session_thread = Arc::clone(&session);
    let limiter_thread = Arc::clone(&limiter);
    let hub_thread = Arc::clone(&hub);
    let settings_thread = settings.clone();

    let join = std::thread::spawn(move || {
        listener.set_nonblocking(true).ok();
        while !stop_thread.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((stream, peer)) => {
                    let _ = stream.set_nonblocking(false);
                    let session = Arc::clone(&session_thread);
                    let limiter = Arc::clone(&limiter_thread);
                    let hub = Arc::clone(&hub_thread);
                    let settings = settings_thread.clone();
                    std::thread::spawn(move || {
                        handle_connection(
                            stream,
                            Some(peer),
                            &settings,
                            &hub,
                            session.as_ref(),
                            limiter.as_ref(),
                        );
                    });
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
        "websockets_start",
        "Local WebSocket server started (loopback)",
        Some(json!({
            "port": port,
            "path": settings.path,
            "ttlSec": WEBSOCKET_TOKEN_TTL.as_secs(),
            "maxConnections": settings.max_connections,
        })),
        "ok",
    );

    let runtime = WebsocketRuntime {
        session: Arc::clone(&session),
        hub,
        settings: settings.clone(),
        port,
        url: url.clone(),
        stop,
        join: Some(join),
    };

    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = Some(runtime);

    Ok(WebsocketServerStatus {
        running: true,
        port: Some(port),
        url: Some(url),
        token: Some(token),
        token_expires_at: Some(session.expires_unix()),
        connection_count: 0,
        settings_enabled: true,
    })
}

#[tauri::command]
pub fn websockets_stop(
    app: AppHandle,
    state: State<'_, WebsocketServerState>,
) -> Result<WebsocketServerStatus, String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(mut runtime) = guard.take() {
        runtime.stop.store(true, Ordering::SeqCst);
        let _ = std::net::TcpStream::connect((runtime.settings.bind_host.as_str(), runtime.port));
        if let Some(join) = runtime.join.take() {
            let _ = join.join();
        }
        log_security(
            &app,
            "websockets_stop",
            "Local WebSocket server stopped",
            Some(json!({ "port": runtime.port })),
            "ok",
        );
    }
    Ok(WebsocketServerStatus::idle(false))
}
