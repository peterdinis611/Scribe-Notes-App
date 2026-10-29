use crate::types::CaptureCreated;

/// Validates short-lived capture session tokens (Bearer / custom header).
pub trait CaptureTokenAuth: Send + Sync {
    fn is_valid(&self, token: &str) -> bool;
}

/// Per-client rate limiting for the capture HTTP server.
pub trait CaptureRateLimit: Send + Sync {
    fn check(&self, client_key: &str) -> bool;
}

/// Creates inbox notes from capture POSTs.
pub trait CaptureInbox: Send + Sync {
    fn create_note(&self, title: &str, body: &str) -> Result<CaptureCreated, String>;
}

/// Stable client key for rate limiting (IP or `"local"`).
pub fn client_key(peer: Option<std::net::SocketAddr>) -> String {
    peer.map(|addr| addr.ip().to_string())
        .unwrap_or_else(|| "local".to_string())
}
