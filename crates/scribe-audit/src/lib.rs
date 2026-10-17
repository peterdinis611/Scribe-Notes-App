//! Scribe audit log — append-only SQLite (`scribe-audit.db`) for app + MCP.

mod admin;
mod db;
mod store;
mod types;

pub use admin::{admin_is_configured, MIN_PASSWORD_CHARS};
pub use db::{open_audit_db, open_audit_db_memory, AuditDb, AUDIT_DB_FILE, SCHEMA_VERSION};
pub use store::{
    log_denied, log_error, log_ok, AuditStore, EVENTS_KEEP, EVENTS_KEEP_DEFAULT, EVENTS_KEEP_MAX,
    EVENTS_KEEP_MIN,
};
pub use types::{
    normalize_action, normalize_category, normalize_outcome, normalize_source, AuditCountBucket,
    AuditEvent, AuditEventInput, AuditListQuery, AuditStats,
};
