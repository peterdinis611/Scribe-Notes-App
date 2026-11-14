//! Server status surface — keep in sync with FE `WebsocketServerStatus`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebsocketServerStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
    pub token: Option<String>,
    pub token_expires_at: Option<i64>,
    pub connection_count: u32,
    pub settings_enabled: bool,
}

impl WebsocketServerStatus {
    pub fn idle(settings_enabled: bool) -> Self {
        Self {
            running: false,
            port: None,
            url: None,
            token: None,
            token_expires_at: None,
            connection_count: 0,
            settings_enabled,
        }
    }
}
