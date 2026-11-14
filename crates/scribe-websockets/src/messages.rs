//! JSON message envelopes for the local WebSocket protocol.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::channels::WebsocketChannel;

pub const PROTOCOL_VERSION: u32 = 1;

/// Client → server frames.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientMessage {
    #[serde(rename = "hello")]
    Hello {
        #[serde(default = "default_protocol_version")]
        protocol: u32,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        token: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        client: Option<String>,
    },
    #[serde(rename = "subscribe")]
    Subscribe {
        channels: Vec<String>,
    },
    #[serde(rename = "unsubscribe")]
    Unsubscribe {
        channels: Vec<String>,
    },
    #[serde(rename = "ping")]
    Ping {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        id: Option<String>,
    },
}

/// Server → client frames.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ServerMessage {
    #[serde(rename = "welcome")]
    Welcome {
        protocol: u32,
        channels: Vec<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        server: Option<String>,
    },
    #[serde(rename = "event")]
    Event {
        channel: String,
        name: String,
        #[serde(default)]
        payload: Value,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        at: Option<i64>,
    },
    #[serde(rename = "subscribed")]
    Subscribed {
        channels: Vec<String>,
    },
    #[serde(rename = "unsubscribed")]
    Unsubscribed {
        channels: Vec<String>,
    },
    #[serde(rename = "pong")]
    Pong {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        id: Option<String>,
    },
    #[serde(rename = "error")]
    Error {
        code: String,
        message: String,
    },
}

fn default_protocol_version() -> u32 {
    PROTOCOL_VERSION
}

impl ServerMessage {
    pub fn welcome(server: Option<&str>) -> Self {
        Self::Welcome {
            protocol: PROTOCOL_VERSION,
            channels: WebsocketChannel::ALL
                .iter()
                .map(|channel| channel.as_str().to_string())
                .collect(),
            server: server.map(|value| value.to_string()),
        }
    }

    pub fn event(channel: WebsocketChannel, name: impl Into<String>, payload: Value, at: Option<i64>) -> Self {
        Self::Event {
            channel: channel.as_str().to_string(),
            name: name.into(),
            payload,
            at,
        }
    }

    pub fn error(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Error {
            code: code.into(),
            message: message.into(),
        }
    }
}

/// Normalize a subscribe/unsubscribe channel list (trim, lowercase, dedupe, drop unknown).
pub fn normalize_channel_list(raw: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for item in raw {
        if let Some(channel) = WebsocketChannel::parse(item) {
            let id = channel.as_str().to_string();
            if !out.iter().any(|existing| existing == &id) {
                out.push(id);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn roundtrips_client_hello() {
        let msg = ClientMessage::Hello {
            protocol: 1,
            token: Some("tok".into()),
            client: Some("fe".into()),
        };
        let raw = serde_json::to_string(&msg).unwrap();
        let back: ClientMessage = serde_json::from_str(&raw).unwrap();
        assert_eq!(msg, back);
        assert!(raw.contains("\"type\":\"hello\""));
    }

    #[test]
    fn builds_event() {
        let msg = ServerMessage::event(WebsocketChannel::Audit, "appended", json!({"id": 1}), Some(10));
        let raw = serde_json::to_value(&msg).unwrap();
        assert_eq!(raw["type"], "event");
        assert_eq!(raw["channel"], "audit");
        assert_eq!(raw["name"], "appended");
    }

    #[test]
    fn normalizes_channel_list() {
        let list = normalize_channel_list(&[
            " Docs ".into(),
            "documents".into(),
            "nope".into(),
            "nlp".into(),
        ]);
        assert_eq!(list, vec!["documents".to_string(), "nlp".to_string()]);
    }
}
