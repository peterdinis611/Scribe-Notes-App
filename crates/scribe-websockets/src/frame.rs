//! Encode / decode text frames (JSON). Hosts own the WebSocket transport.

use crate::messages::{ClientMessage, ServerMessage};
use crate::settings::WebsocketSettings;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FrameError {
    Empty,
    TooLarge { bytes: usize, max: u32 },
    InvalidJson(String),
}

impl std::fmt::Display for FrameError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Empty => write!(f, "empty websocket frame"),
            Self::TooLarge { bytes, max } => {
                write!(f, "websocket frame too large ({bytes} > {max})")
            }
            Self::InvalidJson(err) => write!(f, "invalid websocket json: {err}"),
        }
    }
}

impl std::error::Error for FrameError {}

fn check_size(raw: &str, max_message_bytes: u32) -> Result<(), FrameError> {
    let bytes = raw.len();
    if bytes == 0 {
        return Err(FrameError::Empty);
    }
    if bytes as u32 > max_message_bytes {
        return Err(FrameError::TooLarge {
            bytes,
            max: max_message_bytes,
        });
    }
    Ok(())
}

pub fn encode_server_message(message: &ServerMessage) -> Result<String, FrameError> {
    serde_json::to_string(message).map_err(|err| FrameError::InvalidJson(err.to_string()))
}

pub fn encode_client_message(message: &ClientMessage) -> Result<String, FrameError> {
    serde_json::to_string(message).map_err(|err| FrameError::InvalidJson(err.to_string()))
}

pub fn decode_client_message(
    raw: &str,
    settings: &WebsocketSettings,
) -> Result<ClientMessage, FrameError> {
    check_size(raw, settings.max_message_bytes)?;
    serde_json::from_str(raw).map_err(|err| FrameError::InvalidJson(err.to_string()))
}

pub fn decode_server_message(
    raw: &str,
    settings: &WebsocketSettings,
) -> Result<ServerMessage, FrameError> {
    check_size(raw, settings.max_message_bytes)?;
    serde_json::from_str(raw).map_err(|err| FrameError::InvalidJson(err.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::messages::ClientMessage;
    use crate::settings::default_websocket_settings;

    #[test]
    fn rejects_oversized_frame() {
        let mut settings = default_websocket_settings();
        settings.max_message_bytes = 16;
        let err = decode_client_message(r#"{"type":"ping","id":"way-too-long-id"}"#, &settings)
            .unwrap_err();
        assert!(matches!(err, FrameError::TooLarge { .. }));
    }

    #[test]
    fn roundtrips_ping() {
        let settings = default_websocket_settings();
        let msg = ClientMessage::Ping {
            id: Some("1".into()),
        };
        let raw = encode_client_message(&msg).unwrap();
        let back = decode_client_message(&raw, &settings).unwrap();
        assert_eq!(msg, back);
    }
}
