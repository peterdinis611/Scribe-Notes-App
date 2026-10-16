//! Video URL detection, provider extraction, and export embed resolution.
//!
//! Pure helpers — TipTap / ReactPlayer stay in the frontend.
//!
//! Keep the TypeScript mirror in sync: `src/lib/editor/video.ts`.

mod detect;
mod embed;
mod extract;
mod normalize;
mod provider;
mod url;

pub use detect::{has_video_ext, is_video_url, VIDEO_FILE_EXT, VIDEO_HOSTS};
pub use embed::{video_export_embed, VideoEmbedKind, VideoExportEmbed};
pub use extract::{
    extract_dailymotion_id, extract_loom_id, extract_streamable_id, extract_tiktok_id,
    extract_twitch_id, extract_vimeo_id, extract_youtube_id,
};
pub use normalize::normalize_video_src;
pub use provider::{detect_provider, video_provider_label, VideoProvider};

/// Snapshot of resolved video metadata for UI / MCP.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub src: String,
    pub normalized: String,
    pub provider: VideoProvider,
    pub label: String,
    pub is_video: bool,
    pub export: VideoExportEmbed,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub youtube_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vimeo_id: Option<String>,
}

/// One-shot inspect for Tauri / MCP callers.
pub fn inspect_video(src: &str) -> VideoInfo {
    let trimmed = src.trim().to_string();
    let provider = detect_provider(&trimmed);
    VideoInfo {
        src: trimmed.clone(),
        normalized: normalize_video_src(&trimmed),
        provider,
        label: provider.label().into(),
        is_video: is_video_url(&trimmed),
        export: video_export_embed(&trimmed),
        youtube_id: extract_youtube_id(&trimmed),
        vimeo_id: extract_vimeo_id(&trimmed),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inspect_youtube() {
        let info = inspect_video("https://youtu.be/abc123");
        assert!(info.is_video);
        assert_eq!(info.provider, VideoProvider::YouTube);
        assert_eq!(info.youtube_id.as_deref(), Some("abc123"));
        assert_eq!(info.export.kind, "iframe");
    }
}
