//! Sync WebSocket accept handler (`tungstenite`). Feature: `server`.

use std::net::{SocketAddr, TcpStream};
use std::sync::mpsc;
use std::time::Duration;

use http::StatusCode;
use tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tungstenite::{accept_hdr, Message, WebSocket};

use crate::auth::origin_allowed;
use crate::frame::{decode_client_message, encode_server_message};
use crate::hub::SharedHub;
use crate::messages::ServerMessage;
use crate::session::ConnectionSession;
use crate::settings::WebsocketSettings;
use crate::traits::{client_key, WebsocketRateLimit, WebsocketTokenAuth};

fn write_message(socket: &mut WebSocket<TcpStream>, message: &ServerMessage) -> Result<(), String> {
    let raw = encode_server_message(message).map_err(|err| err.to_string())?;
    socket
        .send(Message::Text(raw.into()))
        .map_err(|err| err.to_string())
}

fn deny(status: StatusCode, body: &str) -> ErrorResponse {
    http::Response::builder()
        .status(status)
        .body(Some(body.to_string()))
        .unwrap_or_else(|_| http::Response::new(Some(body.to_string())))
}

/// Handle one accepted TCP connection (blocking until close).
pub fn handle_connection(
    stream: TcpStream,
    peer: Option<SocketAddr>,
    settings: &WebsocketSettings,
    hub: &SharedHub,
    auth: &dyn WebsocketTokenAuth,
    limiter: &dyn WebsocketRateLimit,
) {
    let key = client_key(peer);
    if !limiter.check(&key) {
        let _ = stream.shutdown(std::net::Shutdown::Both);
        return;
    }

    if hub.connection_count() >= settings.max_connections {
        let _ = stream.shutdown(std::net::Shutdown::Both);
        return;
    }

    let _ = stream.set_read_timeout(Some(Duration::from_millis(250)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

    let expected_path = settings.path.clone();
    let allowed = settings.clone();
    let mut socket = match accept_hdr(stream, |req: &Request, response: Response| {
        let path = req.uri().path();
        if path != expected_path.as_str() {
            return Err(deny(StatusCode::NOT_FOUND, "unknown websocket path"));
        }
        let origin = req
            .headers()
            .get("Origin")
            .and_then(|value| value.to_str().ok());
        if !origin_allowed(&allowed, origin) {
            return Err(deny(StatusCode::FORBIDDEN, "origin not allowed"));
        }
        Ok(response)
    }) {
        Ok(socket) => socket,
        Err(_) => return,
    };

    let (tx, rx) = mpsc::channel::<ServerMessage>();
    let connection_id = hub.register(tx);
    let mut session = ConnectionSession::default();

    loop {
        while let Ok(outbound) = rx.try_recv() {
            if write_message(&mut socket, &outbound).is_err() {
                hub.unregister(connection_id);
                return;
            }
        }

        match socket.read() {
            Ok(Message::Text(text)) => {
                let Ok(client) = decode_client_message(text.as_str(), settings) else {
                    let _ = write_message(
                        &mut socket,
                        &ServerMessage::error("frame.invalid", "Invalid JSON frame"),
                    );
                    continue;
                };
                let outcome = session.handle_client(client, settings, auth);
                if outcome.subscribed_changed {
                    hub.set_channels(connection_id, &session.channels);
                }
                for reply in &outcome.replies {
                    if write_message(&mut socket, reply).is_err() {
                        hub.unregister(connection_id);
                        return;
                    }
                }
                if outcome.close {
                    hub.unregister(connection_id);
                    let _ = socket.close(None);
                    return;
                }
            }
            Ok(Message::Ping(payload)) => {
                let _ = socket.send(Message::Pong(payload));
            }
            Ok(Message::Pong(_)) | Ok(Message::Frame(_)) => {}
            Ok(Message::Binary(_)) => {
                let _ = write_message(
                    &mut socket,
                    &ServerMessage::error("frame.binary", "Binary frames are not supported"),
                );
            }
            Ok(Message::Close(_)) => {
                hub.unregister(connection_id);
                return;
            }
            Err(tungstenite::Error::Io(ref err))
                if err.kind() == std::io::ErrorKind::WouldBlock
                    || err.kind() == std::io::ErrorKind::TimedOut =>
            {
                continue;
            }
            Err(_) => {
                hub.unregister(connection_id);
                return;
            }
        }
    }
}
