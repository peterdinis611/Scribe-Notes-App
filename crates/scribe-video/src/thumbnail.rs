//! Best-effort thumbnail URLs (no network).

use crate::extract::{
    extract_dailymotion_id, extract_vimeo_id, extract_youtube_id,
};
use crate::provider::{detect_provider, VideoProvider};

/// Return a public thumbnail URL when the provider exposes a stable pattern.
///
/// Note: Vimeo/Dailymotion official thumbs often need an API — we return `None`
/// for those unless a well-known static pattern exists. YouTube always works.
pub fn video_thumbnail_url(src: &str) -> Option<String> {
    let trimmed = src.trim();
    match detect_provider(trimmed) {
        VideoProvider::YouTube => {
            let id = extract_youtube_id(trimmed)?;
            Some(format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg"))
        }
        VideoProvider::Dailymotion => {
            let id = extract_dailymotion_id(trimmed)?;
            Some(format!("https://www.dailymotion.com/thumbnail/video/{id}"))
        }
        VideoProvider::Vimeo => {
            // Vimeo requires oEmbed; keep id available via inspect instead.
            let _ = extract_vimeo_id(trimmed)?;
            None
        }
        _ => None,
    }
}

/// YouTube-only maxres attempt (may 404; callers should fall back to hqdefault).
pub fn youtube_maxres_thumbnail_url(src: &str) -> Option<String> {
    let id = extract_youtube_id(src.trim())?;
    Some(format!("https://i.ytimg.com/vi/{id}/maxresdefault.jpg"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn youtube_thumb() {
        let url = video_thumbnail_url("https://youtu.be/dQw4w9WgXcQ").unwrap();
        assert!(url.contains("dQw4w9WgXcQ"));
        assert!(url.contains("hqdefault"));
    }
}
