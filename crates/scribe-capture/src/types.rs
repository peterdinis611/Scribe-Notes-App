use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
    pub token: Option<String>,
    pub token_expires_at: Option<i64>,
    pub lan_ip: Option<String>,
    pub allow_lan: bool,
    pub inbox_folder_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureCreated {
    pub document_id: String,
    pub title: String,
    pub folder_id: String,
}

impl CaptureStatus {
    pub fn idle(lan_ip: Option<String>) -> Self {
        Self {
            running: false,
            port: None,
            url: None,
            token: None,
            token_expires_at: None,
            lan_ip,
            allow_lan: false,
            inbox_folder_id: None,
        }
    }
}
