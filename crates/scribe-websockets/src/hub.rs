//! Fan-out hub: channel subscriptions → connection senders.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::sync::mpsc;

use serde_json::Value;

use crate::channels::WebsocketChannel;
use crate::messages::ServerMessage;

pub type ConnectionId = u64;
pub type HubSender = mpsc::Sender<ServerMessage>;

#[derive(Debug)]
struct ConnectionEntry {
    channels: HashSet<String>,
    tx: HubSender,
}

#[derive(Debug, Default)]
pub struct Hub {
    next_id: AtomicU64,
    connections: Mutex<HashMap<ConnectionId, ConnectionEntry>>,
    connection_count: AtomicU32,
}

impl Hub {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&self, tx: HubSender) -> ConnectionId {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst) + 1;
        if let Ok(mut guard) = self.connections.lock() {
            guard.insert(
                id,
                ConnectionEntry {
                    channels: HashSet::new(),
                    tx,
                },
            );
            self.connection_count
                .store(guard.len() as u32, Ordering::SeqCst);
        }
        id
    }

    pub fn unregister(&self, id: ConnectionId) {
        if let Ok(mut guard) = self.connections.lock() {
            guard.remove(&id);
            self.connection_count
                .store(guard.len() as u32, Ordering::SeqCst);
        }
    }

    pub fn set_channels(&self, id: ConnectionId, channels: &[String]) {
        if let Ok(mut guard) = self.connections.lock() {
            if let Some(entry) = guard.get_mut(&id) {
                entry.channels = channels.iter().cloned().collect();
            }
        }
    }

    pub fn connection_count(&self) -> u32 {
        self.connection_count.load(Ordering::SeqCst)
    }

    pub fn broadcast(&self, message: ServerMessage) {
        let Ok(guard) = self.connections.lock() else {
            return;
        };
        for entry in guard.values() {
            let _ = entry.tx.send(message.clone());
        }
    }

    pub fn broadcast_event(
        &self,
        channel: WebsocketChannel,
        name: impl Into<String>,
        payload: Value,
        at: Option<i64>,
    ) {
        let channel_id = channel.as_str();
        let message = ServerMessage::event(channel, name, payload, at);
        let Ok(guard) = self.connections.lock() else {
            return;
        };
        for entry in guard.values() {
            if entry.channels.contains(channel_id) {
                let _ = entry.tx.send(message.clone());
            }
        }
    }
}

pub type SharedHub = Arc<Hub>;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn fans_out_to_subscribers_only() {
        let hub = Hub::new();
        let (tx_a, rx_a) = mpsc::channel();
        let (tx_b, rx_b) = mpsc::channel();
        let a = hub.register(tx_a);
        let b = hub.register(tx_b);
        hub.set_channels(a, &["audit".into()]);
        hub.set_channels(b, &["nlp".into()]);
        hub.broadcast_event(WebsocketChannel::Audit, "appended", json!({}), Some(1));
        assert!(rx_a.try_recv().is_ok());
        assert!(rx_b.try_recv().is_err());
        assert_eq!(hub.connection_count(), 2);
        hub.unregister(a);
        assert_eq!(hub.connection_count(), 1);
    }
}
