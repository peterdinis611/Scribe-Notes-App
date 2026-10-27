//! Streamable HTTP transport so Cursor / remote agents can hit MCP over the network.
//! Also mounts a small REST surface (`/v1/…`) for library folders + files sandbox.
//!
//! Bind defaults to loopback. Non-loopback binds **require** `SCRIBE_MCP_HTTP_TOKEN`.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, Request, StatusCode};
use axum::middleware::{from_fn_with_state, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use tokio_util::sync::CancellationToken;

use crate::rest::{self, RestState};
use crate::server::ScribeMcp;

#[derive(Clone)]
struct HttpAuthState {
    /// When set, require `Authorization: Bearer <token>` (or raw token) on `/mcp` and `/v1`.
    token: Option<Arc<str>>,
}

fn env_truthy(name: &str) -> bool {
    matches!(
        std::env::var(name).ok().as_deref().map(str::trim),
        Some("1" | "true" | "yes" | "on")
    )
}

pub fn http_mode_requested(args: &[String]) -> bool {
    args.iter().any(|a| a == "--http" || a == "--http-only")
        || env_truthy("SCRIBE_MCP_HTTP")
}

pub fn parse_bind_addr(args: &[String]) -> anyhow::Result<SocketAddr> {
    let mut bind = std::env::var("SCRIBE_MCP_HTTP_BIND")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "127.0.0.1:8788".into());
    for window in args.windows(2) {
        if window[0] == "--bind" {
            bind = window[1].clone();
        }
    }
    bind.parse()
        .map_err(|e| anyhow::anyhow!("Invalid SCRIBE_MCP_HTTP_BIND / --bind `{bind}`: {e}"))
}

fn http_token() -> Option<Arc<str>> {
    std::env::var("SCRIBE_MCP_HTTP_TOKEN")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .map(Arc::from)
}

fn is_loopback(addr: &SocketAddr) -> bool {
    match addr {
        SocketAddr::V4(v4) => v4.ip().is_loopback(),
        SocketAddr::V6(v6) => v6.ip().is_loopback(),
    }
}

async fn require_bearer(
    State(auth): State<HttpAuthState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let Some(expected) = auth.token.as_ref() else {
        return next.run(request).await;
    };
    let header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let ok = header == expected.as_ref()
        || header
            .strip_prefix("Bearer ")
            .is_some_and(|t| t == expected.as_ref());
    if !ok {
        return (
            StatusCode::UNAUTHORIZED,
            "Unauthorized — set Authorization: Bearer <SCRIBE_MCP_HTTP_TOKEN>",
        )
            .into_response();
    }
    next.run(request).await
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

pub async fn serve_http(server: ScribeMcp, bind: SocketAddr) -> anyhow::Result<()> {
    let token = http_token();
    if !is_loopback(&bind) && token.is_none() {
        anyhow::bail!(
            "Refusing to bind {bind} without SCRIBE_MCP_HTTP_TOKEN. \
             Set a secret token, or bind 127.0.0.1 and use a tunnel."
        );
    }
    if token.is_none() {
        eprintln!(
            "[scribe-mcp] WARNING: HTTP mode without SCRIBE_MCP_HTTP_TOKEN (loopback only)."
        );
    } else {
        eprintln!("[scribe-mcp] HTTP auth: Bearer token required on /mcp and /v1");
    }

    let ct = CancellationToken::new();
    let shared = server.clone();
    let mcp = StreamableHttpService::new(
        move || Ok(shared.clone()),
        LocalSessionManager::default().into(),
        StreamableHttpServerConfig::default()
            .with_cancellation_token(ct.child_token())
            .with_json_response(true),
    );

    let auth = HttpAuthState {
        token: token.clone(),
    };
    let mcp_routes = Router::new()
        .nest_service("/", mcp)
        .layer(from_fn_with_state(auth.clone(), require_bearer));

    let rest_state = RestState { mcp: server };
    let v1 = Router::new()
        .route("/", get(rest::api_catalog))
        .route(
            "/library/folders",
            get(rest::list_library_folders).post(rest::create_library_folder),
        )
        .route("/fs/list", get(rest::fs_list))
        .route("/fs/mkdir", post(rest::fs_mkdir))
        .route("/fs/write-text", post(rest::fs_write_text))
        .route("/fs/write", post(rest::fs_write))
        .route("/fs/upload", post(rest::fs_upload))
        .with_state(rest_state)
        .layer(from_fn_with_state(auth, require_bearer));

    let app = Router::new()
        .route("/health", get(health))
        .nest("/mcp", mcp_routes)
        .nest("/v1", v1);

    let listener = tokio::net::TcpListener::bind(bind).await?;
    eprintln!(
        "[scribe-mcp] HTTP listening on http://{bind}/mcp  (health: http://{bind}/health)"
    );
    eprintln!(
        "[scribe-mcp] REST: http://{bind}/v1  (folders + files sandbox; writes need SCRIBE_MCP_WRITE=1)"
    );
    eprintln!(
        "[scribe-mcp] Cursor remote example: url http://{bind}/mcp  + header Authorization: Bearer <token>"
    );

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let _ = tokio::signal::ctrl_c().await;
            ct.cancel();
        })
        .await?;
    Ok(())
}
