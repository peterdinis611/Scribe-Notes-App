//! Thin Tauri surface for `scribe-websockets` (settings + protocol helpers).

#[tauri::command]
pub fn default_websocket_settings() -> scribe_websockets::WebsocketSettings {
    scribe_websockets::default_websocket_settings()
}

#[tauri::command]
pub fn normalize_websocket_settings(
    settings: scribe_websockets::WebsocketSettings,
) -> scribe_websockets::WebsocketSettings {
    scribe_websockets::normalize_websocket_settings(settings)
}

#[tauri::command]
pub fn websocket_settings_from_json(
    raw: String,
) -> Result<scribe_websockets::WebsocketSettings, String> {
    scribe_websockets::websocket_settings_from_json(&raw)
}

#[tauri::command]
pub fn websocket_url(settings: scribe_websockets::WebsocketSettings) -> String {
    let normalized = scribe_websockets::normalize_websocket_settings(settings);
    scribe_websockets::websocket_url(&normalized)
}

#[tauri::command]
pub fn websocket_channel_ids() -> Vec<String> {
    scribe_websockets::channel_ids()
        .into_iter()
        .map(str::to_string)
        .collect()
}

#[tauri::command]
pub fn normalize_websocket_channels(channels: Vec<String>) -> Vec<String> {
    scribe_websockets::normalize_channel_list(&channels)
}
