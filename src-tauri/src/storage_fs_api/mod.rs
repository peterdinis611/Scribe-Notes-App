//! Loopback Files API server (REST + GraphQL + OpenAPI demo) for Storage Mode.
//!
//! Disabled by default — start explicitly from Settings. Every request (except
//! OPTIONS and a minimal unauthenticated health probe) requires
//! `Authorization: Bearer <token>` issued when the server starts.

mod http;
mod openapi;

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::db::DbState;
use crate::security::{log_security, RateLimiter, TokenSession, FILES_TOKEN_TTL};
use crate::storage;
use http::handle_connection;

pub const DEFAULT_PORT: u16 = 8787;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageFsEndpoint {
    pub method: String,
    pub path: String,
    pub label: String,
    pub group: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageFsServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
    /// Bearer token for API clients. Present only while the server is running.
    pub token: Option<String>,
    /// Unix timestamp when the bearer token expires.
    pub token_expires_at: Option<i64>,
    pub documents_dir: Option<String>,
    pub files_root: Option<String>,
    pub endpoints: Vec<StorageFsEndpoint>,
}

struct Runtime {
    port: u16,
    url: String,
    session: Arc<TokenSession>,
    documents_dir: PathBuf,
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

pub struct StorageFsServerState {
    inner: Mutex<Option<Runtime>>,
}

impl StorageFsServerState {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

pub fn endpoint_catalog() -> Vec<StorageFsEndpoint> {
    vec![
        ep("GET", "/v1/fs/health", "Health", "meta"),
        ep("GET", "/openapi.json", "OpenAPI 3.0 spec", "docs"),
        ep("GET", "/docs", "Swagger demo UI", "docs"),
        ep("GET", "/v1/fs/list", "List", "rest"),
        ep("GET", "/v1/fs/tree", "Tree", "rest"),
        ep("GET", "/v1/fs/stat", "Stat", "rest"),
        ep("GET", "/v1/fs/exists", "Exists", "rest"),
        ep("GET", "/v1/fs/read", "Read (base64)", "rest"),
        ep("GET", "/v1/fs/read-text", "Read text", "rest"),
        ep("GET", "/v1/fs/read-json", "Read JSON", "rest"),
        ep("GET", "/v1/fs/preview", "Preview text", "rest"),
        ep("GET", "/v1/fs/checksum", "SHA-256 checksum", "rest"),
        ep("GET", "/v1/fs/search", "Search", "rest"),
        ep("GET", "/v1/fs/recent", "Recent files", "rest"),
        ep("GET", "/v1/fs/disk-usage", "Disk usage", "rest"),
        ep("POST", "/v1/fs/mkdir", "Mkdir", "rest"),
        ep("POST", "/v1/fs/write", "Write bytes", "rest"),
        ep("POST", "/v1/fs/write-text", "Write text", "rest"),
        ep("POST", "/v1/fs/write-json", "Write JSON", "rest"),
        ep("POST", "/v1/fs/append", "Append bytes", "rest"),
        ep("POST", "/v1/fs/append-text", "Append text", "rest"),
        ep("POST", "/v1/fs/touch", "Touch", "rest"),
        ep("POST", "/v1/fs/delete", "Delete", "rest"),
        ep("POST", "/v1/fs/clear-dir", "Clear directory", "rest"),
        ep("POST", "/v1/fs/rename", "Rename", "rest"),
        ep("POST", "/v1/fs/move-into", "Move into", "rest"),
        ep("POST", "/v1/fs/copy", "Copy", "rest"),
        ep("POST", "/v1/fs/ensure-defaults", "Ensure defaults", "rest"),
        ep("POST", "/graphql", "GraphQL", "graphql"),
        ep("GET", "/graphql", "GraphiQL playground", "graphql"),
    ]
}

fn ep(method: &str, path: &str, label: &str, group: &str) -> StorageFsEndpoint {
    StorageFsEndpoint {
        method: method.into(),
        path: path.into(),
        label: label.into(),
        group: group.into(),
    }
}

fn status_from(runtime: Option<&Runtime>) -> StorageFsServerStatus {
    let endpoints = endpoint_catalog();
    match runtime {
        Some(rt) => StorageFsServerStatus {
            running: true,
            port: Some(rt.port),
            url: Some(rt.url.clone()),
            token: Some(rt.session.token.clone()),
            token_expires_at: Some(rt.session.expires_unix()),
            documents_dir: Some(rt.documents_dir.to_string_lossy().into_owned()),
            files_root: Some(rt.documents_dir.join("files").to_string_lossy().into_owned()),
            endpoints,
        },
        None => StorageFsServerStatus {
            running: false,
            port: None,
            url: None,
            token: None,
            token_expires_at: None,
            documents_dir: None,
            files_root: None,
            endpoints,
        },
    }
}

#[tauri::command]
pub fn storage_fs_server_status(
    state: State<'_, StorageFsServerState>,
) -> Result<StorageFsServerStatus, String> {
    let guard = state.inner.lock().map_err(|e| e.to_string())?;
    Ok(status_from(guard.as_ref()))
}

#[tauri::command]
pub fn storage_fs_server_start(
    app: AppHandle,
    state: State<'_, StorageFsServerState>,
    db: State<'_, DbState>,
    port: Option<u16>,
) -> Result<StorageFsServerStatus, String> {
    {
        let guard = state.inner.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            drop(guard);
            return storage_fs_server_status(state);
        }
    }

    let documents_dir = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        storage::get_documents_dir(&app, &conn)?
    };
    let _ = scribe_core::storage_fs::ensure_files_root(&documents_dir)?;
    let _ = scribe_core::storage_fs::ensure_defaults(&documents_dir)?;

    let preferred = port.unwrap_or(DEFAULT_PORT);
    let listener = TcpListener::bind(("127.0.0.1", preferred))
        .or_else(|_| TcpListener::bind(("127.0.0.1", 0)))
        .map_err(|e| format!("Could not bind Files API port: {e}"))?;
    let bound = listener.local_addr().map_err(|e| e.to_string())?.port();
    let url = format!("http://127.0.0.1:{bound}");
    let token = Uuid::new_v4().to_string().replace('-', "");
    let session = Arc::new(TokenSession::new(token, FILES_TOKEN_TTL));
    let limiter = Arc::new(RateLimiter::new());

    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = Arc::clone(&stop);
    let docs_thread = documents_dir.clone();
    let session_thread = Arc::clone(&session);
    let limiter_thread = Arc::clone(&limiter);

    let join = std::thread::spawn(move || {
        let _ = listener.set_nonblocking(true);
        while !stop_thread.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((stream, peer)) => {
                    let _ = stream.set_nonblocking(false);
                    handle_connection(
                        stream,
                        Some(peer),
                        &docs_thread,
                        bound,
                        &session_thread,
                        &limiter_thread,
                    );
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(40));
                }
                Err(_) => break,
            }
        }
    });

    log_security(
        &app,
        "files_api_start",
        "Files API started on loopback",
        Some(json!({ "port": bound, "ttlSec": FILES_TOKEN_TTL.as_secs() })),
        "ok",
    );

    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = Some(Runtime {
        port: bound,
        url,
        session,
        documents_dir,
        stop,
        join: Some(join),
    });
    Ok(status_from(guard.as_ref()))
}

#[tauri::command]
pub fn storage_fs_server_stop(
    state: State<'_, StorageFsServerState>,
) -> Result<StorageFsServerStatus, String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(mut runtime) = guard.take() {
        runtime.stop.store(true, Ordering::SeqCst);
        // Unblock accept
        let _ = std::net::TcpStream::connect(("127.0.0.1", runtime.port));
        if let Some(join) = runtime.join.take() {
            let _ = join.join();
        }
    }
    Ok(status_from(None))
}

#[cfg(test)]
mod tests {
    use super::http::{bearer_token_from_headers, path_escapes_files_root, token_authorized};

    #[test]
    fn bearer_parses_authorization_header() {
        let headers = "Host: localhost\r\nAuthorization: Bearer abc123\r\n\r\n";
        assert_eq!(bearer_token_from_headers(headers).as_deref(), Some("abc123"));
    }

    #[test]
    fn bearer_rejects_missing_or_wrong_token() {
        assert!(bearer_token_from_headers("Host: x\r\n\r\n").is_none());
        assert!(bearer_token_from_headers("Authorization: Basic abc\r\n").is_none());
        let headers = "Authorization: Bearer wrong\r\n";
        assert!(!token_authorized(headers, "/v1/fs/list", "secret"));
    }

    #[test]
    fn access_token_query_allowed_only_for_docs_paths() {
        let expected = "tok123";
        assert!(token_authorized("", "/docs?access_token=tok123", expected));
        assert!(token_authorized("", "/openapi.json?access_token=tok123", expected));
        assert!(token_authorized("", "/graphql?access_token=tok123", expected));
        // Data APIs must not accept query tokens.
        assert!(!token_authorized("", "/v1/fs/list?access_token=tok123", expected));
        assert!(!token_authorized("", "/v1/fs/read-text?access_token=tok123&path=a", expected));
    }

    #[test]
    fn bearer_authorizes_data_api_paths() {
        let headers = "Authorization: Bearer tok123\r\n";
        assert!(token_authorized(headers, "/v1/fs/list?path=", "tok123"));
        assert!(token_authorized(headers, "/v1/fs/write", "tok123"));
    }

    #[test]
    fn path_escape_rejected() {
        assert!(path_escapes_files_root("../etc/passwd"));
        assert!(path_escapes_files_root("files/../../secret"));
        assert!(path_escapes_files_root(".."));
        assert!(!path_escapes_files_root("notes/a.md"));
        assert!(!path_escapes_files_root("a/b/../c.md"));
        assert!(!path_escapes_files_root(""));
    }

    #[test]
    fn http_integration_requires_bearer() {
        use crate::security::{RateLimiter, TokenSession, FILES_TOKEN_TTL};
        use std::io::{Read, Write};
        use std::net::TcpListener;
        use std::sync::atomic::{AtomicBool, Ordering};
        use std::sync::Arc;
        use std::time::Duration;

        let dir = std::env::temp_dir().join(format!(
            "scribe-fs-http-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(dir.join("files")).unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let stop = Arc::new(AtomicBool::new(false));
        let stop_t = Arc::clone(&stop);
        let session = Arc::new(TokenSession::new("test-token-xyz".into(), FILES_TOKEN_TTL));
        let limiter = Arc::new(RateLimiter::new());
        let session_t = Arc::clone(&session);
        let limiter_t = Arc::clone(&limiter);
        let dir_t = dir.clone();
        let join = std::thread::spawn(move || {
            let _ = listener.set_nonblocking(true);
            let deadline = std::time::Instant::now() + Duration::from_secs(3);
            while !stop_t.load(Ordering::SeqCst) && std::time::Instant::now() < deadline {
                match listener.accept() {
                    Ok((stream, peer)) => {
                        let _ = stream.set_nonblocking(false);
                        super::http::handle_connection(
                            stream,
                            Some(peer),
                            &dir_t,
                            port,
                            &session_t,
                            &limiter_t,
                        );
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(10));
                    }
                    Err(_) => break,
                }
            }
        });

        let mut no_auth = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        no_auth
            .write_all(b"GET /v1/fs/list HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .unwrap();
        let mut buf = String::new();
        no_auth.read_to_string(&mut buf).unwrap();
        assert!(buf.contains("401"), "expected 401, got: {buf}");

        let mut ok = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        ok.write_all(
            b"GET /v1/fs/health HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer test-token-xyz\r\nConnection: close\r\n\r\n",
        )
        .unwrap();
        let mut buf2 = String::new();
        ok.read_to_string(&mut buf2).unwrap();
        assert!(buf2.contains("200"), "expected 200, got: {buf2}");
        assert!(buf2.contains("\"ok\":true") || buf2.contains("\"ok\": true"));

        stop.store(true, Ordering::SeqCst);
        let _ = std::net::TcpStream::connect(("127.0.0.1", port));
        let _ = join.join();
        let _ = std::fs::remove_dir_all(dir);
    }
}
