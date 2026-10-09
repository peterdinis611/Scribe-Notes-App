//! Scribe audit log — append-only SQLite (`scribe-audit.db`) for app + MCP.

mod admin;
mod db;
mod store;

pub use db::{open_audit_db, open_audit_db_memory, AuditDb, AUDIT_DB_FILE, SCHEMA_VERSION};
pub use store::{log_ok, AuditEvent, AuditEventInput, AuditStore, EVENTS_KEEP};
