//! Shared rate limiting + short-lived bearer tokens for loopback HTTP helpers.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Files API token lifetime (short; rotate from Settings).
pub const FILES_TOKEN_TTL: Duration = Duration::from_secs(30 * 60); // 30 minutes
/// Mobile capture token lifetime.
pub const CAPTURE_TOKEN_TTL: Duration = Duration::from_secs(15 * 60); // 15 minutes
/// Stop capture after this much idle time without a successful POST.
pub const CAPTURE_IDLE_STOP: Duration = Duration::from_secs(15 * 60);

/// Max authenticated/unauthenticated attempts per client IP in the window.
pub const RATE_LIMIT_MAX: u32 = 60;
pub const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(60);

#[derive(Debug)]
struct TokenInner {
    token: String,
    expires_at: Instant,
    ttl: Duration,
}

/// Mutable short-lived bearer session (safe to share via `Arc`).
#[derive(Debug)]
pub struct TokenSession {
    inner: Mutex<TokenInner>,
}

impl TokenSession {
    pub fn new(token: String, ttl: Duration) -> Self {
        Self {
            inner: Mutex::new(TokenInner {
                token,
                expires_at: Instant::now() + ttl,
                ttl,
            }),
        }
    }

    pub fn is_valid(&self, candidate: &str) -> bool {
        let Ok(guard) = self.inner.lock() else {
            return false;
        };
        Instant::now() < guard.expires_at
            && constant_time_eq(guard.token.as_bytes(), candidate.as_bytes())
    }

    pub fn is_expired(&self) -> bool {
        let Ok(guard) = self.inner.lock() else {
            return true;
        };
        Instant::now() >= guard.expires_at
    }

    pub fn token(&self) -> String {
        self.inner
            .lock()
            .map(|g| g.token.clone())
            .unwrap_or_default()
    }

    pub fn expires_unix(&self) -> i64 {
        let Ok(guard) = self.inner.lock() else {
            return chrono::Utc::now().timestamp();
        };
        let remaining = guard
            .expires_at
            .saturating_duration_since(Instant::now())
            .as_secs() as i64;
        chrono::Utc::now().timestamp() + remaining
    }

    /// Replace the secret and reset TTL. Returns new expiry unix timestamp.
    pub fn rotate(&self, new_token: String) -> i64 {
        let Ok(mut guard) = self.inner.lock() else {
            return chrono::Utc::now().timestamp();
        };
        let ttl = guard.ttl;
        guard.token = new_token;
        guard.expires_at = Instant::now() + ttl;
        let remaining = ttl.as_secs() as i64;
        chrono::Utc::now().timestamp() + remaining
    }

    /// Extend expiry without changing the token (refresh).
    pub fn refresh(&self) -> i64 {
        let Ok(mut guard) = self.inner.lock() else {
            return chrono::Utc::now().timestamp();
        };
        let ttl = guard.ttl;
        guard.expires_at = Instant::now() + ttl;
        chrono::Utc::now().timestamp() + ttl.as_secs() as i64
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

/// Redact bearer-like secrets and absolute home paths from log / audit strings.
pub fn redact_secrets(input: &str) -> String {
    let mut out = input.to_string();
    // Long hex/base64-ish tokens
    if let Ok(re) = regex::Regex::new(r"(?i)(bearer\s+)[a-z0-9_\-]{16,}") {
        out = re.replace_all(&out, "${1}***").into_owned();
    }
    if let Ok(re) = regex::Regex::new(r"(?i)(token[=:]\s*)[a-z0-9_\-]{12,}") {
        out = re.replace_all(&out, "${1}***").into_owned();
    }
    if let Ok(re) = regex::Regex::new(r"(?i)(password[=:]\s*)\S+") {
        out = re.replace_all(&out, "${1}***").into_owned();
    }
    // Collapse /Users/... and /home/... to ~/**
    if let Ok(re) = regex::Regex::new(r"(?i)(/Users|/home)/[^/\s]+") {
        out = re.replace_all(&out, "$1/***").into_owned();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_expires() {
        let session = TokenSession::new("abc".into(), Duration::from_millis(1));
        std::thread::sleep(Duration::from_millis(5));
        assert!(!session.is_valid("abc"));
    }

    #[test]
    fn token_matches_while_fresh() {
        let session = TokenSession::new("secret".into(), Duration::from_secs(30));
        assert!(session.is_valid("secret"));
        assert!(!session.is_valid("other"));
    }

    #[test]
    fn token_rotate_invalidates_old() {
        let session = TokenSession::new("old".into(), Duration::from_secs(60));
        session.rotate("new".into());
        assert!(!session.is_valid("old"));
        assert!(session.is_valid("new"));
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

    #[test]
    fn redact_hides_bearer_and_home() {
        let s = redact_secrets("Authorization: Bearer abcdefghijklmnop path=/Users/alice/docs");
        assert!(!s.contains("abcdefghijklmnop"));
        assert!(!s.contains("/Users/alice"));
        assert!(s.contains("***"));
    }
}
