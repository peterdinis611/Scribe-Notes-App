//! Local LAN capture HTTP protocol for Scribe (mobile clip → Inbox).
//!
//! Owns the HTML capture page and HTTP request handling. Hosts (Tauri / MCP)
//! supply token auth, rate limiting, and inbox persistence via traits.

mod html;
mod lan;
mod server;
mod traits;
mod types;

pub use html::capture_page;
pub use lan::{detect_lan_ip, DEFAULT_PORT, INBOX_FOLDER_NAME};
pub use server::{handle_connection, presented_capture_token};
pub use traits::{client_key, CaptureInbox, CaptureRateLimit, CaptureTokenAuth};
pub use types::{CaptureCreated, CaptureStatus};
