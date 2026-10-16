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

#[tauri::command]
pub fn extract_start_seconds_ui(src: String) -> Option<u64> {
    scribe_video::extract_start_seconds(&src)
}

#[tauri::command]
pub fn video_thumbnail_url_ui(src: String) -> Option<String> {
    scribe_video::video_thumbnail_url(&src)
}

#[tauri::command]
pub fn extract_provider_id_ui(src: String) -> Option<String> {
    scribe_video::extract_provider_id(&src)
}

#[tauri::command]
pub fn parse_video_fence_ui(body: String) -> scribe_video::VideoBlockAttrs {
    scribe_video::parse_video_fence(&body)
}

#[tauri::command]
pub fn video_to_markdown_fence_ui(
    src: Option<String>,
    caption: Option<String>,
) -> String {
    scribe_video::video_to_markdown_fence(&scribe_video::VideoBlockAttrs { src, caption })
}

#[tauri::command]
pub fn render_video_figure_html_ui(
    src: Option<String>,
    caption: Option<String>,
) -> String {
    scribe_video::render_video_figure_html(&scribe_video::VideoBlockAttrs { src, caption })
}

#[tauri::command]
pub fn collect_videos_from_tiptap_ui(content_json: String) -> Vec<scribe_video::CollectedVideo> {
    scribe_video::collect_videos_from_tiptap_json(&content_json)
}
