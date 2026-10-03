//! Loopback Files API server (REST + GraphQL + OpenAPI demo) for Storage Mode.

mod http;
mod openapi;

use serde::{Deserialize, Serialize};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tauri::{AppHandle, State};

use crate::db::DbState;
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
    pub documents_dir: Option<String>,
    pub files_root: Option<String>,
    pub endpoints: Vec<StorageFsEndpoint>,
}

struct Runtime {
    port: u16,
    url: String,
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
            documents_dir: Some(rt.documents_dir.to_string_lossy().into_owned()),
            files_root: Some(rt.documents_dir.join("files").to_string_lossy().into_owned()),
            endpoints,
        },
        None => StorageFsServerStatus {
            running: false,
            port: None,
            url: None,
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

    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = Arc::clone(&stop);
    let docs_thread = documents_dir.clone();

    let join = std::thread::spawn(move || {
        let _ = listener.set_nonblocking(true);
        while !stop_thread.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    handle_connection(stream, &docs_thread, bound);
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(40));
                }
                Err(_) => break,
            }
        }
    });

    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = Some(Runtime {
        port: bound,
        url,
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
