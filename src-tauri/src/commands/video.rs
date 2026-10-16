//! Tauri commands backed by `scribe-video`.

#[tauri::command]
pub fn is_video_url_ui(value: String) -> bool {
    scribe_video::is_video_url(&value)
}

#[tauri::command]
pub fn video_provider_label_ui(src: String) -> String {
    scribe_video::video_provider_label(&src)
}

#[tauri::command]
pub fn video_export_embed_ui(src: String) -> scribe_video::VideoExportEmbed {
    scribe_video::video_export_embed(&src)
}

#[tauri::command]
pub fn extract_youtube_id_ui(src: String) -> Option<String> {
    scribe_video::extract_youtube_id(&src)
}

#[tauri::command]
pub fn extract_vimeo_id_ui(src: String) -> Option<String> {
    scribe_video::extract_vimeo_id(&src)
}

#[tauri::command]
pub fn detect_video_provider_ui(src: String) -> scribe_video::VideoProvider {
    scribe_video::detect_provider(&src)
}

#[tauri::command]
pub fn normalize_video_src_ui(src: String) -> String {
    scribe_video::normalize_video_src(&src)
}

#[tauri::command]
pub fn inspect_video_ui(src: String) -> scribe_video::VideoInfo {
    scribe_video::inspect_video(&src)
}
