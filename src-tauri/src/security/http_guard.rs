//! Shared rate limiting + short-lived bearer tokens for loopback HTTP helpers.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Files API token lifetime.
pub const FILES_TOKEN_TTL: Duration = Duration::from_secs(60 * 60); // 1 hour
/// Mobile capture token lifetime.
pub const CAPTURE_TOKEN_TTL: Duration = Duration::from_secs(15 * 60); // 15 minutes

/// Max authenticated/unauthenticated attempts per client IP in the window.
pub const RATE_LIMIT_MAX: u32 = 60;
pub const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(60);

#[derive(Debug, Clone)]
pub struct TokenSession {
    pub token: String,
    pub expires_at: Instant,
}

impl TokenSession {
    pub fn new(token: String, ttl: Duration) -> Self {
        Self {
            token,
            expires_at: Instant::now() + ttl,
        }
    }

    pub fn is_valid(&self, candidate: &str) -> bool {
        Instant::now() < self.expires_at && constant_time_eq(self.token.as_bytes(), candidate.as_bytes())
    }

    pub fn expires_unix(&self) -> i64 {
        let remaining = self
            .expires_at
            .saturating_duration_since(Instant::now())
            .as_secs() as i64;
        chrono::Utc::now().timestamp() + remaining
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[derive(Debug, Default)]
pub struct RateLimiter {
    inner: Mutex<HashMap<String, Vec<Instant>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    /// Returns true if the request is allowed.
    pub fn check(&self, key: &str) -> bool {
        self.check_with(key, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW)
    }

    pub fn check_with(&self, key: &str, max: u32, window: Duration) -> bool {
        let Ok(mut guard) = self.inner.lock() else {
            return false;
        };
        let now = Instant::now();
        let entry = guard.entry(key.to_string()).or_default();
        entry.retain(|t| now.duration_since(*t) < window);
        if entry.len() as u32 >= max {
            return false;
        }
        entry.push(now);
        true
    }
}

pub fn client_key(peer: Option<SocketAddr>) -> String {
    peer.map(|a| a.ip().to_string())
        .unwrap_or_else(|| "unknown".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_expires() {
        let session = TokenSession {
            token: "abc".into(),
            expires_at: Instant::now() - Duration::from_secs(1),
        };
        assert!(!session.is_valid("abc"));
    }

    #[test]
    fn token_matches_while_fresh() {
        let session = TokenSession::new("secret".into(), Duration::from_secs(30));
        assert!(session.is_valid("secret"));
        assert!(!session.is_valid("other"));
    }

    #[test]
    fn rate_limiter_trips() {
        let lim = RateLimiter::new();
        for _ in 0..5 {
            assert!(lim.check_with("ip", 5, Duration::from_secs(60)));
        }
        assert!(!lim.check_with("ip", 5, Duration::from_secs(60)));
        assert!(lim.check_with("other", 5, Duration::from_secs(60)));
    }
}
