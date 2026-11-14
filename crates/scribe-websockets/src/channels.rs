//! Named realtime channels hosts may subscribe to.

use serde::{Deserialize, Serialize};

/// Built-in channel ids. Keep in sync with FE `WebsocketChannel`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WebsocketChannel {
    System,
    Documents,
    Audit,
    Nlp,
    Sync,
    Agent,
    Capture,
}

impl WebsocketChannel {
    pub const ALL: [Self; 7] = [
        Self::System,
        Self::Documents,
        Self::Audit,
        Self::Nlp,
        Self::Sync,
        Self::Agent,
        Self::Capture,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::System => "system",
            Self::Documents => "documents",
            Self::Audit => "audit",
            Self::Nlp => "nlp",
            Self::Sync => "sync",
            Self::Agent => "agent",
            Self::Capture => "capture",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "system" => Some(Self::System),
            "documents" | "docs" | "document" => Some(Self::Documents),
            "audit" => Some(Self::Audit),
            "nlp" | "ai" | "local-ai" => Some(Self::Nlp),
            "sync" | "disk-sync" => Some(Self::Sync),
            "agent" => Some(Self::Agent),
            "capture" | "inbox" => Some(Self::Capture),
            _ => None,
        }
    }
}

/// Canonical channel id list for hosts / docs.
pub fn channel_ids() -> Vec<&'static str> {
    WebsocketChannel::ALL
        .iter()
        .map(|channel| channel.as_str())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_aliases() {
        assert_eq!(WebsocketChannel::parse("docs"), Some(WebsocketChannel::Documents));
        assert_eq!(WebsocketChannel::parse("local-ai"), Some(WebsocketChannel::Nlp));
        assert_eq!(WebsocketChannel::parse("nope"), None);
    }
}
