//! Host-supplied auth / rate-limit hooks for the local WebSocket server.

/// Validates short-lived session tokens from `hello`.
pub trait WebsocketTokenAuth: Send + Sync {
    fn is_valid(&self, token: &str) -> bool;
}

/// Per-client rate limiting for hello / subscribe bursts.
pub trait WebsocketRateLimit: Send + Sync {
    fn check(&self, client_key: &str) -> bool;
}

/// Stable client key for rate limiting (IP or `"local"`).
pub fn client_key(peer: Option<std::net::SocketAddr>) -> String {
    peer.map(|addr| addr.ip().to_string())
        .unwrap_or_else(|| "local".to_string())
}
