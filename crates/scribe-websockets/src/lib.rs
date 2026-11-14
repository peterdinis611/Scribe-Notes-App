//! Local WebSocket protocol for Scribe realtime events.
//!
//! Pure domain crate — no TCP / tungstenite / Tauri. Hosts (Tauri, MCP, tests)
//! own the accept loop; this crate owns channels, JSON frames, and settings.
//! FE mirrors live in `src/lib/websockets/`.

mod channels;
mod frame;
mod messages;
mod settings;

pub use channels::{channel_ids, WebsocketChannel};
pub use frame::{
    decode_client_message, decode_server_message, encode_client_message, encode_server_message,
    FrameError,
};
pub use messages::{
    normalize_channel_list, ClientMessage, ServerMessage, PROTOCOL_VERSION,
};
pub use settings::{
    default_websocket_settings, normalize_websocket_settings, websocket_settings_from_json,
    websocket_url, WebsocketSettings, BIND_LOOPBACK, DEFAULT_PATH, DEFAULT_PORT,
};
