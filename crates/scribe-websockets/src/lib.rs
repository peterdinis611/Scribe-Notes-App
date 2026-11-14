//! Local WebSocket protocol for Scribe realtime events.
//!
//! Pure domain by default — no TCP. Enable feature `server` for sync
//! `tungstenite` accept handling. Hosts (Tauri) own the listen loop.
//! FE mirrors live in `src/lib/websockets/`.

mod auth;
mod channels;
mod frame;
mod hub;
mod messages;
mod session;
mod settings;
mod traits;
mod types;

#[cfg(feature = "server")]
mod server;

pub use auth::{origin_allowed, validate_hello_token, AuthError};
pub use channels::{channel_ids, WebsocketChannel};
pub use frame::{
    decode_client_message, decode_server_message, encode_client_message, encode_server_message,
    FrameError,
};
pub use hub::{ConnectionId, Hub, HubSender, SharedHub};
pub use messages::{
    normalize_channel_list, ClientMessage, ServerMessage, PROTOCOL_VERSION,
};
pub use session::{ConnectionSession, SessionOutcome, SessionPhase};
pub use settings::{
    default_websocket_settings, normalize_websocket_settings, websocket_settings_from_json,
    websocket_url, WebsocketSettings, BIND_LOOPBACK, DEFAULT_PATH, DEFAULT_PORT,
};
pub use traits::{client_key, WebsocketRateLimit, WebsocketTokenAuth};
pub use types::WebsocketServerStatus;

#[cfg(feature = "server")]
pub use server::handle_connection;
