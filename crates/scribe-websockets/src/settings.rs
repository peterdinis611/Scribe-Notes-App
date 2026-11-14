//! Local WebSocket server preferences. Keep in sync with FE `WebsocketSettings`.

use serde::{Deserialize, Serialize};

/// Default bind port — distinct from Storage FS API (8787) and MCP HTTP (8788).
pub const DEFAULT_PORT: u16 = 8789;
pub const DEFAULT_PATH: &str = "/ws";
pub const BIND_LOOPBACK: &str = "127.0.0.1";

const PORT_MIN: u16 = 1024;
const HEARTBEAT_MIN_MS: u32 = 5_000;
const HEARTBEAT_MAX_MS: u32 = 120_000;
const MAX_CONNECTIONS_MIN: u32 = 1;
const MAX_CONNECTIONS_MAX: u32 = 64;
const MAX_MESSAGE_BYTES_MIN: u32 = 1_024;
const MAX_MESSAGE_BYTES_MAX: u32 = 1_048_576;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebsocketSettings {
    pub enabled: bool,
    /// Bind address (loopback by default).
    pub bind_host: String,
    pub port: u16,
    /// HTTP upgrade path, e.g. `/ws`.
    pub path: String,
    pub require_token: bool,
    pub heartbeat_interval_ms: u32,
    pub max_connections: u32,
    pub max_message_bytes: u32,
    /// Empty = fall back to tauri/localhost origins.
    pub allowed_origins: Vec<String>,
}

impl Default for WebsocketSettings {
    fn default() -> Self {
        default_websocket_settings()
    }
}

pub fn default_websocket_settings() -> WebsocketSettings {
    WebsocketSettings {
        enabled: false,
        bind_host: BIND_LOOPBACK.to_string(),
        port: DEFAULT_PORT,
        path: DEFAULT_PATH.to_string(),
        require_token: true,
        heartbeat_interval_ms: 30_000,
        max_connections: 8,
        max_message_bytes: 65_536,
        allowed_origins: vec!["tauri://localhost".into(), "http://localhost".into()],
    }
}

fn clamp_u32(value: u32, min: u32, max: u32) -> u32 {
    value.clamp(min, max)
}

fn normalize_path(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return DEFAULT_PATH.to_string();
    }
    let with_slash = if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    };
    if with_slash.len() > 1 && with_slash.ends_with('/') {
        with_slash.trim_end_matches('/').to_string()
    } else {
        with_slash
    }
}

fn normalize_host(raw: &str) -> String {
    let trimmed = raw.trim().to_ascii_lowercase();
    if trimmed.is_empty()
        || trimmed == "localhost"
        || trimmed == "127.0.0.1"
        || trimmed == "::1"
        || trimmed == "[::1]"
    {
        return BIND_LOOPBACK.to_string();
    }
    // Safety default: never silently bind all interfaces from prefs.
    if trimmed == "0.0.0.0" || trimmed == "*" || trimmed == "::" {
        return BIND_LOOPBACK.to_string();
    }
    trimmed
}

pub fn normalize_websocket_settings(input: WebsocketSettings) -> WebsocketSettings {
    // u16 max is 65_535; only enforce privileged-port floor.
    let port = if input.port < PORT_MIN {
        DEFAULT_PORT
    } else {
        input.port
    };

    let allowed_origins: Vec<String> = input
        .allowed_origins
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .fold(Vec::new(), |mut acc, item| {
            if !acc.iter().any(|existing| existing.eq_ignore_ascii_case(&item)) {
                acc.push(item);
            }
            acc
        });

    WebsocketSettings {
        enabled: input.enabled,
        bind_host: normalize_host(&input.bind_host),
        port,
        path: normalize_path(&input.path),
        require_token: input.require_token,
        heartbeat_interval_ms: clamp_u32(
            input.heartbeat_interval_ms,
            HEARTBEAT_MIN_MS,
            HEARTBEAT_MAX_MS,
        ),
        max_connections: clamp_u32(input.max_connections, MAX_CONNECTIONS_MIN, MAX_CONNECTIONS_MAX),
        max_message_bytes: clamp_u32(
            input.max_message_bytes,
            MAX_MESSAGE_BYTES_MIN,
            MAX_MESSAGE_BYTES_MAX,
        ),
        allowed_origins: if allowed_origins.is_empty() {
            default_websocket_settings().allowed_origins
        } else {
            allowed_origins
        },
    }
}

pub fn websocket_settings_from_json(raw: &str) -> Result<WebsocketSettings, String> {
    let parsed: WebsocketSettings =
        serde_json::from_str(raw).map_err(|err| format!("invalid websocket settings: {err}"))?;
    Ok(normalize_websocket_settings(parsed))
}

/// `ws://host:port/path` for status / QR / docs (no token query).
pub fn websocket_url(settings: &WebsocketSettings) -> String {
    let host = settings.bind_host.trim();
    let path = if settings.path.starts_with('/') {
        settings.path.clone()
    } else {
        format!("/{}", settings.path)
    };
    format!("ws://{host}:{}{path}", settings.port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_defaults_and_path() {
        let mut settings = default_websocket_settings();
        settings.path = "events/".into();
        settings.bind_host = "0.0.0.0".into();
        settings.port = 80;
        settings.heartbeat_interval_ms = 1;
        let next = normalize_websocket_settings(settings);
        assert_eq!(next.path, "/events");
        assert_eq!(next.bind_host, BIND_LOOPBACK);
        assert_eq!(next.port, DEFAULT_PORT);
        assert!(next.heartbeat_interval_ms >= HEARTBEAT_MIN_MS);
        assert!(websocket_url(&next).starts_with("ws://127.0.0.1:"));
    }

    #[test]
    fn parses_json() {
        let raw = r#"{"enabled":true,"bindHost":"127.0.0.1","port":9000,"path":"/ws","requireToken":true,"heartbeatIntervalMs":30000,"maxConnections":4,"maxMessageBytes":4096,"allowedOrigins":["tauri://localhost"]}"#;
        let settings = websocket_settings_from_json(raw).unwrap();
        assert!(settings.enabled);
        assert_eq!(settings.port, 9000);
        assert_eq!(settings.max_connections, 4);
        assert!(settings.require_token);
    }
}
