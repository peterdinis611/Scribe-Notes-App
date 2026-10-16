//! Canonical watch URLs for known providers.

use crate::extract::{
    extract_dailymotion_id, extract_loom_id, extract_streamable_id, extract_tiktok_id,
    extract_twitch_id, extract_vimeo_id, extract_youtube_id,
};

/// Return a stable “watch” URL when the provider is known; otherwise trim the input.
pub fn normalize_video_src(src: &str) -> String {
    let trimmed = src.trim();
    if let Some(id) = extract_youtube_id(trimmed) {
        return format!("https://www.youtube.com/watch?v={id}");
    }
    if let Some(id) = extract_vimeo_id(trimmed) {
        return format!("https://vimeo.com/{id}");
    }
    if let Some(id) = extract_dailymotion_id(trimmed) {
        return format!("https://www.dailymotion.com/video/{id}");
    }
    if let Some(id) = extract_loom_id(trimmed) {
        return format!("https://www.loom.com/share/{id}");
    }
    if let Some(id) = extract_streamable_id(trimmed) {
        return format!("https://streamable.com/{id}");
    }
    if let Some(id) = extract_tiktok_id(trimmed) {
        return format!("https://www.tiktok.com/video/{id}");
    }
    if let Some((kind, id)) = extract_twitch_id(trimmed) {
        return match kind.as_str() {
            "clip" => format!("https://clips.twitch.tv/{id}"),
            "video" => format!("https://www.twitch.tv/videos/{id}"),
            "channel" => format!("https://www.twitch.tv/{id}"),
            _ => trimmed.to_string(),
        };
    }
    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_youtube_short_links() {
        assert_eq!(
            normalize_video_src("https://youtu.be/abc123"),
            "https://www.youtube.com/watch?v=abc123"
        );
    }
}
