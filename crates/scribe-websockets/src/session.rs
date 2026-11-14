//! Per-connection protocol state machine.

use crate::auth::{validate_hello_token, AuthError};
use crate::messages::{normalize_channel_list, ClientMessage, ServerMessage, PROTOCOL_VERSION};
use crate::settings::WebsocketSettings;
use crate::traits::WebsocketTokenAuth;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionPhase {
    AwaitingHello,
    Ready,
    Closed,
}

#[derive(Debug, Clone)]
pub struct ConnectionSession {
    pub phase: SessionPhase,
    pub channels: Vec<String>,
    pub client: Option<String>,
}

impl Default for ConnectionSession {
    fn default() -> Self {
        Self {
            phase: SessionPhase::AwaitingHello,
            channels: Vec::new(),
            client: None,
        }
    }
}

#[derive(Debug)]
pub struct SessionOutcome {
    pub replies: Vec<ServerMessage>,
    pub subscribed_changed: bool,
    pub close: bool,
}

impl ConnectionSession {
    pub fn handle_client(
        &mut self,
        message: ClientMessage,
        settings: &WebsocketSettings,
        auth: &dyn WebsocketTokenAuth,
    ) -> SessionOutcome {
        match self.phase {
            SessionPhase::Closed => SessionOutcome {
                replies: vec![ServerMessage::error("session.closed", "Connection closed")],
                subscribed_changed: false,
                close: true,
            },
            SessionPhase::AwaitingHello => self.handle_hello(message, settings, auth),
            SessionPhase::Ready => self.handle_ready(message),
        }
    }

    fn handle_hello(
        &mut self,
        message: ClientMessage,
        settings: &WebsocketSettings,
        auth: &dyn WebsocketTokenAuth,
    ) -> SessionOutcome {
        match message {
            ClientMessage::Hello {
                protocol,
                token,
                client,
            } => {
                if protocol != 0 && protocol != PROTOCOL_VERSION {
                    return SessionOutcome {
                        replies: vec![ServerMessage::error(
                            "protocol.unsupported",
                            format!("Expected protocol {PROTOCOL_VERSION}"),
                        )],
                        subscribed_changed: false,
                        close: true,
                    };
                }
                if let Err(err) = validate_hello_token(settings, auth, token.as_deref()) {
                    return SessionOutcome {
                        replies: vec![err.to_server_message()],
                        subscribed_changed: false,
                        close: matches!(err, AuthError::InvalidToken | AuthError::MissingToken),
                    };
                }
                self.phase = SessionPhase::Ready;
                self.client = client;
                SessionOutcome {
                    replies: vec![ServerMessage::welcome(Some("scribe"))],
                    subscribed_changed: false,
                    close: false,
                }
            }
            ClientMessage::Ping { id } => SessionOutcome {
                replies: vec![ServerMessage::Pong { id }],
                subscribed_changed: false,
                close: false,
            },
            _ => SessionOutcome {
                replies: vec![ServerMessage::error(
                    "session.hello_required",
                    "Send hello before other frames",
                )],
                subscribed_changed: false,
                close: false,
            },
        }
    }

    fn handle_ready(&mut self, message: ClientMessage) -> SessionOutcome {
        match message {
            ClientMessage::Hello { .. } => SessionOutcome {
                replies: vec![ServerMessage::error(
                    "session.already_ready",
                    "Already authenticated",
                )],
                subscribed_changed: false,
                close: false,
            },
            ClientMessage::Subscribe { channels } => {
                let next = normalize_channel_list(&channels);
                for channel in &next {
                    if !self.channels.iter().any(|existing| existing == channel) {
                        self.channels.push(channel.clone());
                    }
                }
                SessionOutcome {
                    replies: vec![ServerMessage::Subscribed {
                        channels: self.channels.clone(),
                    }],
                    subscribed_changed: true,
                    close: false,
                }
            }
            ClientMessage::Unsubscribe { channels } => {
                let drop = normalize_channel_list(&channels);
                self.channels
                    .retain(|channel| !drop.iter().any(|item| item == channel));
                SessionOutcome {
                    replies: vec![ServerMessage::Unsubscribed { channels: drop }],
                    subscribed_changed: true,
                    close: false,
                }
            }
            ClientMessage::Ping { id } => SessionOutcome {
                replies: vec![ServerMessage::Pong { id }],
                subscribed_changed: false,
                close: false,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::default_websocket_settings;

    struct OkAuth;
    impl WebsocketTokenAuth for OkAuth {
        fn is_valid(&self, token: &str) -> bool {
            token == "secret"
        }
    }

    #[test]
    fn hello_then_subscribe() {
        let settings = default_websocket_settings();
        let mut session = ConnectionSession::default();
        let hello = session.handle_client(
            ClientMessage::Hello {
                protocol: 1,
                token: Some("secret".into()),
                client: Some("test".into()),
            },
            &settings,
            &OkAuth,
        );
        assert!(!hello.close);
        assert!(matches!(hello.replies[0], ServerMessage::Welcome { .. }));
        assert_eq!(session.phase, SessionPhase::Ready);

        let sub = session.handle_client(
            ClientMessage::Subscribe {
                channels: vec!["docs".into(), "audit".into()],
            },
            &settings,
            &OkAuth,
        );
        assert_eq!(session.channels, vec!["documents".to_string(), "audit".to_string()]);
        assert!(sub.subscribed_changed);
    }
}
