//! Resolve export / print embed targets for video URLs.

use crate::detect::has_video_ext;
use crate::extract::{
    extract_dailymotion_id, extract_loom_id, extract_streamable_id, extract_tiktok_id,
    extract_twitch_id, extract_vimeo_id, extract_youtube_id,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VideoEmbedKind {
    Iframe,
    Video,
    Link,
}

impl VideoEmbedKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Iframe => "iframe",
            Self::Video => "video",
            Self::Link => "link",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoExportEmbed {
    /// Wire-compatible string: `"iframe" | "video" | "link"`.
    pub kind: String,
    pub href: String,
}

impl VideoExportEmbed {
    pub fn new(kind: VideoEmbedKind, href: impl Into<String>) -> Self {
        Self {
            kind: kind.as_str().into(),
            href: href.into(),
        }
    }
}

/// Resolve a stable embed/playback URL for HTML export and print.
pub fn video_export_embed(src: &str) -> VideoExportEmbed {
    let trimmed = src.trim();
    if let Some(id) = extract_youtube_id(trimmed) {
        return VideoExportEmbed::new(
            VideoEmbedKind::Iframe,
            format!("https://www.youtube-nocookie.com/embed/{id}"),
        );
    }
    if let Some(id) = extract_vimeo_id(trimmed) {
        return VideoExportEmbed::new(
            VideoEmbedKind::Iframe,
            format!("https://player.vimeo.com/video/{id}"),
        );
    }
    if let Some(id) = extract_dailymotion_id(trimmed) {
        return VideoExportEmbed::new(
            VideoEmbedKind::Iframe,
            format!("https://www.dailymotion.com/embed/video/{id}"),
        );
    }
    if let Some(id) = extract_loom_id(trimmed) {
        return VideoExportEmbed::new(
            VideoEmbedKind::Iframe,
            format!("https://www.loom.com/embed/{id}"),
        );
    }
    if let Some(id) = extract_streamable_id(trimmed) {
        return VideoExportEmbed::new(
            VideoEmbedKind::Iframe,
            format!("https://streamable.com/e/{id}"),
        );
    }
    if let Some(id) = extract_tiktok_id(trimmed) {
        return VideoExportEmbed::new(
            VideoEmbedKind::Iframe,
            format!("https://www.tiktok.com/embed/v2/{id}"),
        );
    }
    if let Some((kind, id)) = extract_twitch_id(trimmed) {
        let href = match kind.as_str() {
            "clip" => format!("https://clips.twitch.tv/embed?clip={id}&parent=localhost"),
            "video" => format!("https://player.twitch.tv/?video={id}&parent=localhost"),
            "channel" => format!("https://player.twitch.tv/?channel={id}&parent=localhost"),
            _ => trimmed.to_string(),
        };
        if href != trimmed {
            return VideoExportEmbed::new(VideoEmbedKind::Iframe, href);
        }
    }
    if has_video_ext(trimmed) {
        return VideoExportEmbed::new(VideoEmbedKind::Video, trimmed);
    }
    VideoExportEmbed::new(VideoEmbedKind::Link, trimmed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_provider_embeds() {
        let yt = video_export_embed("https://www.youtube.com/watch?v=abc123");
        assert_eq!(yt.kind, "iframe");
        assert_eq!(yt.href, "https://www.youtube-nocookie.com/embed/abc123");

        let file = video_export_embed("https://files.example.com/a.webm");
        assert_eq!(file.kind, "video");

        let loom = video_export_embed("https://www.loom.com/share/deadbeef");
        assert_eq!(loom.href, "https://www.loom.com/embed/deadbeef");
    }
}
