//! Simple REST API next to Streamable MCP — library folders + files sandbox upload.
//!
//! Protected by the same Bearer token as `/mcp`. Writes need `SCRIBE_MCP_WRITE=1`.

use axum::extract::{Multipart, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use scribe_core::storage_fs::{self, ListOpts};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::server::ScribeMcp;

#[derive(Clone)]
pub struct RestState {
    pub mcp: ScribeMcp,
}

fn err_response(status: StatusCode, message: impl Into<String>) -> Response {
    (
        status,
        Json(json!({ "ok": false, "error": message.into() })),
    )
        .into_response()
}

fn require_writable(mcp: &ScribeMcp) -> Result<(), Response> {
    if mcp.writable {
        Ok(())
    } else {
        Err(err_response(
            StatusCode::FORBIDDEN,
            "Read-only MCP — set SCRIBE_MCP_WRITE=1 to create folders / upload files",
        ))
    }
}

fn docs_dir(mcp: &ScribeMcp) -> Result<std::path::PathBuf, Response> {
    mcp.with_store(|store| store.documents_dir())
        .map_err(|e| err_response(StatusCode::INTERNAL_SERVER_ERROR, e))
}

// ── Library folders (SQLite sidebar tree) ───────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLibraryFolderBody {
    pub name: String,
    pub parent_id: Option<String>,
}

pub async fn list_library_folders(State(state): State<RestState>) -> Response {
    match state.mcp.with_store(|store| store.list_folders()) {
        Ok(folders) => Json(json!({ "ok": true, "count": folders.len(), "folders": folders }))
            .into_response(),
        Err(e) => err_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

pub async fn create_library_folder(
    State(state): State<RestState>,
    Json(body): Json<CreateLibraryFolderBody>,
) -> Response {
    if let Err(resp) = require_writable(&state.mcp) {
        return resp;
    }
    let name = body.name.trim();
    if name.is_empty() {
        return err_response(StatusCode::BAD_REQUEST, "name is required");
    }
    match state
        .mcp
        .with_store(|store| store.create_folder(name, body.parent_id.as_deref()))
    {
        Ok(folder) => {
            state.mcp.audit_mcp(
                "mcp_tool",
                "http_create_folder",
                &format!("HTTP create_folder {}", folder.id),
                Some(json!({ "id": folder.id, "name": folder.name })),
                "ok",
            );
            (StatusCode::CREATED, Json(json!({ "ok": true, "folder": folder }))).into_response()
        }
        Err(e) => err_response(StatusCode::BAD_REQUEST, e),
    }
}

// ── Files sandbox (`documents/files/…`) ─────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsListQuery {
    pub path: Option<String>,
    pub recursive: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsMkdirBody {
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsWriteTextBody {
    pub path: String,
    pub text: String,
    pub overwrite: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsWriteBody {
    pub path: String,
    /// Raw base64 file bytes.
    pub content_base64: String,
    pub overwrite: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApiCatalog {
    ok: bool,
    endpoints: Vec<EndpointInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EndpointInfo {
    method: &'static str,
    path: &'static str,
    description: &'static str,
}

pub async fn api_catalog() -> Json<ApiCatalog> {
    Json(ApiCatalog {
        ok: true,
        endpoints: vec![
            EndpointInfo {
                method: "GET",
                path: "/health",
                description: "Liveness",
            },
            EndpointInfo {
                method: "GET",
                path: "/v1",
                description: "This catalog",
            },
            EndpointInfo {
                method: "GET",
                path: "/v1/library/folders",
                description: "List note-library folders",
            },
            EndpointInfo {
                method: "POST",
                path: "/v1/library/folders",
                description: "Create note-library folder { name, parentId? }",
            },
            EndpointInfo {
                method: "GET",
                path: "/v1/fs/list?path=&recursive=",
                description: "List files sandbox entries",
            },
            EndpointInfo {
                method: "POST",
                path: "/v1/fs/mkdir",
                description: "Create sandbox directory { path }",
            },
            EndpointInfo {
                method: "POST",
                path: "/v1/fs/write-text",
                description: "Write UTF-8 file { path, text, overwrite? }",
            },
            EndpointInfo {
                method: "POST",
                path: "/v1/fs/write",
                description: "Write binary file { path, contentBase64, overwrite? }",
            },
            EndpointInfo {
                method: "POST",
                path: "/v1/fs/upload",
                description: "multipart/form-data: one or many file fields + optional path=dir/; folder upload keeps relative names",
            },
            EndpointInfo {
                method: "*",
                path: "/mcp",
                description: "MCP Streamable HTTP",
            },
        ],
    })
}

pub async fn fs_list(
    State(state): State<RestState>,
    Query(query): Query<FsListQuery>,
) -> Response {
    let docs = match docs_dir(&state.mcp) {
        Ok(d) => d,
        Err(r) => return r,
    };
    let opts = ListOpts {
        path: query.path.filter(|p| !p.trim().is_empty()),
        recursive: query.recursive.unwrap_or(false),
        depth: None,
    };
    match storage_fs::list(&docs, opts) {
        Ok(entries) => {
            Json(json!({ "ok": true, "count": entries.len(), "entries": entries })).into_response()
        }
        Err(e) => err_response(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn fs_mkdir(
    State(state): State<RestState>,
    Json(body): Json<FsMkdirBody>,
) -> Response {
    if let Err(resp) = require_writable(&state.mcp) {
        return resp;
    }
    let docs = match docs_dir(&state.mcp) {
        Ok(d) => d,
        Err(r) => return r,
    };
    match storage_fs::mkdir(&docs, &body.path) {
        Ok(entry) => {
            state.mcp.audit_mcp(
                "mcp_tool",
                "http_fs_mkdir",
                &format!("HTTP fs mkdir {}", body.path),
                Some(json!({ "path": body.path })),
                "ok",
            );
            (StatusCode::CREATED, Json(json!({ "ok": true, "entry": entry }))).into_response()
        }
        Err(e) => err_response(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn fs_write_text(
    State(state): State<RestState>,
    Json(body): Json<FsWriteTextBody>,
) -> Response {
    if let Err(resp) = require_writable(&state.mcp) {
        return resp;
    }
    let docs = match docs_dir(&state.mcp) {
        Ok(d) => d,
        Err(r) => return r,
    };
    let overwrite = body.overwrite.unwrap_or(true);
    match storage_fs::write_text(&docs, &body.path, &body.text, overwrite) {
        Ok(entry) => {
            state.mcp.audit_mcp(
                "mcp_tool",
                "http_fs_write_text",
                &format!("HTTP fs write-text {}", body.path),
                Some(json!({ "path": body.path, "bytes": body.text.len() })),
                "ok",
            );
            Json(json!({ "ok": true, "entry": entry })).into_response()
        }
        Err(e) => err_response(StatusCode::BAD_REQUEST, e),
    }
}

pub async fn fs_write(
    State(state): State<RestState>,
    Json(body): Json<FsWriteBody>,
) -> Response {
    if let Err(resp) = require_writable(&state.mcp) {
        return resp;
    }
    let docs = match docs_dir(&state.mcp) {
        Ok(d) => d,
        Err(r) => return r,
    };
    let bytes = match STANDARD.decode(body.content_base64.trim()) {
        Ok(b) => b,
        Err(e) => {
            return err_response(
                StatusCode::BAD_REQUEST,
                format!("Invalid contentBase64: {e}"),
            )
        }
    };
    let overwrite = body.overwrite.unwrap_or(true);
    match storage_fs::write_file(&docs, &body.path, &bytes, overwrite) {
        Ok(entry) => {
            state.mcp.audit_mcp(
                "mcp_tool",
                "http_fs_write",
                &format!("HTTP fs write {}", body.path),
                Some(json!({ "path": body.path, "bytes": bytes.len() })),
                "ok",
            );
            Json(json!({ "ok": true, "entry": entry })).into_response()
        }
        Err(e) => err_response(StatusCode::BAD_REQUEST, e),
    }
}

/// `multipart/form-data` with one or many `file` fields and optional `path` (base directory).
///
/// Folder uploads (e.g. `<input webkitdirectory>`) send multiple files whose `filename`
/// may include relative path segments (`notes/a.md`); those are preserved under `path`.
pub async fn fs_upload(
    State(state): State<RestState>,
    mut multipart: Multipart,
) -> Response {
    if let Err(resp) = require_writable(&state.mcp) {
        return resp;
    }
    let docs = match docs_dir(&state.mcp) {
        Ok(d) => d,
        Err(r) => return r,
    };

    let mut dest_hint: Option<String> = None;
    let mut uploads: Vec<(String, Vec<u8>)> = Vec::new();

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        if name == "path" || name == "dir" {
            if let Ok(text) = field.text().await {
                dest_hint = Some(text.trim().to_string());
            }
            continue;
        }
        if name == "file" || name == "upload" || name == "files" || name.is_empty() {
            let file_name = field
                .file_name()
                .map(|s| s.to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "upload.bin".into());
            match field.bytes().await {
                Ok(data) => uploads.push((file_name, data.to_vec())),
                Err(e) => {
                    return err_response(StatusCode::BAD_REQUEST, format!("Upload read failed: {e}"))
                }
            }
        }
    }

    if uploads.is_empty() {
        return err_response(
            StatusCode::BAD_REQUEST,
            "multipart field `file` (one or many) with binary content is required",
        );
    }

    let base = dest_hint
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.trim_matches('/').to_string());

    let mut entries = Vec::new();
    let mut failed = Vec::new();

    for (filename, data) in uploads {
        let normalized = filename.replace('\\', "/");
        let rel_name = normalized
            .trim_start_matches('/')
            .split('/')
            .filter(|part| !part.is_empty() && *part != "." && *part != "..")
            .collect::<Vec<_>>()
            .join("/");
        if rel_name.is_empty() {
            failed.push(json!({ "fileName": filename, "error": "Invalid upload filename" }));
            continue;
        }
        let rel = match base.as_deref() {
            Some(hint) => format!("{hint}/{rel_name}"),
            None => rel_name,
        };
        match storage_fs::write_file(&docs, &rel, &data, true) {
            Ok(entry) => {
                state.mcp.audit_mcp(
                    "mcp_tool",
                    "http_fs_upload",
                    &format!("HTTP fs upload {rel}"),
                    Some(json!({ "path": rel, "bytes": data.len() })),
                    "ok",
                );
                entries.push(json!({ "path": rel, "entry": entry, "bytes": data.len() }));
            }
            Err(e) => failed.push(json!({ "path": rel, "error": e })),
        }
    }

    if entries.is_empty() && !failed.is_empty() {
        return err_response(
            StatusCode::BAD_REQUEST,
            failed
                .first()
                .and_then(|v| v.get("error"))
                .and_then(|v| v.as_str())
                .unwrap_or("Upload failed")
                .to_string(),
        );
    }

    (
        StatusCode::CREATED,
        Json(json!({
            "ok": true,
            "count": entries.len(),
            "failedCount": failed.len(),
            "entries": entries,
            "failed": failed,
            // Back-compat for single-file clients
            "path": entries.first().and_then(|e| e.get("path")).cloned(),
            "entry": entries.first().and_then(|e| e.get("entry")).cloned(),
        })),
    )
        .into_response()
}
