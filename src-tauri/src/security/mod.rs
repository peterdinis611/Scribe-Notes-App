mod audit_events;
mod http_guard;
mod path_access;
mod secrets;

pub use audit_events::log_security;
pub use http_guard::{
    client_key, redact_secrets, RateLimiter, TokenSession, CAPTURE_IDLE_STOP, CAPTURE_TOKEN_TTL,
    FILES_TOKEN_TTL,
};
pub use path_access::{safe_join_under, PathAccessGate};
pub use secrets::{get_auto_backup_password, set_auto_backup_password};
