//! Video URL detection, provider extraction, and export embed resolution.
//!
//! Pure helpers — TipTap / ReactPlayer stay in the frontend.
//!
//! Keep the TypeScript mirror in sync: `src/lib/editor/video.ts`.

mod collect;
mod detect;
mod embed;
mod extract;
mod html;
mod library;
mod markdown;
mod normalize;
mod provider;
mod thumbnail;
mod timestamp;
mod url;

pub use collect::{collect_videos_from_tiptap, collect_videos_from_tiptap_json, CollectedVideo};
pub use library::{
    default_import_mode, extension_of, is_local_video_path, normalize_language_code,
    normalize_whisper_model, title_from_path, validate_import_size, validate_import_source_path,
    validate_optional_document_id, validate_thumb_seek, validate_title, validate_transcribe_request,
    validate_video_extension, validate_video_id, validate_video_rel_path, video_dir_rel,
    video_source_rel, video_thumb_rel, video_transcript_rel, ImportLocalVideoRequest,
    ImportLocalVideoResult, LibraryVideo, LibraryVideoStatus, ProbeVideoResult,
    TranscribeVideoRequest, TranscribeVideoResult, TranscriptSegment, VideoImportMode,
    ALLOWED_WHISPER_MODELS, LARGE_VIDEO_HINT_BYTES, LIBRARY_VIDEOS_PREFIX, MAX_COPY_BYTES,
    MAX_THUMB_SEEK_SECS, MAX_VIDEO_ID_CHARS, MAX_VIDEO_TITLE_CHARS, MIN_VIDEO_BYTES,
    TRANSCRIBE_VIDEO_METHOD,
};
pub use detect::{has_video_ext, is_video_url, VIDEO_FILE_EXT, VIDEO_HOSTS};
pub use embed::{video_export_embed, VideoEmbedKind, VideoExportEmbed};
pub use extract::{
    extract_bilibili_id, extract_dailymotion_id, extract_loom_id, extract_provider_id,
    extract_streamable_id, extract_tiktok_id, extract_twitch_id, extract_vimeo_id,
    extract_wistia_id, extract_youtube_id,
};
pub use html::render_video_figure_html;
pub use markdown::{
    parse_video_fence, promote_video_code_block, video_tiptap_node, video_to_markdown_fence,
    VideoBlockAttrs,
};
pub use normalize::normalize_video_src;
pub use provider::{detect_provider, video_provider_label, VideoProvider};
pub use thumbnail::{video_thumbnail_url, youtube_maxres_thumbnail_url};
pub use timestamp::{extract_start_seconds, parse_duration_token};

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
    pub provider_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_seconds: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
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
        provider_id: extract_provider_id(&trimmed),
        start_seconds: extract_start_seconds(&trimmed),
        thumbnail_url: video_thumbnail_url(&trimmed),
        youtube_id: extract_youtube_id(&trimmed),
        vimeo_id: extract_vimeo_id(&trimmed),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inspect_youtube_with_start() {
        let info = inspect_video("https://youtu.be/abc123?t=90");
        assert!(info.is_video);
        assert_eq!(info.provider, VideoProvider::YouTube);
        assert_eq!(info.youtube_id.as_deref(), Some("abc123"));
        assert_eq!(info.start_seconds, Some(90));
        assert_eq!(info.export.kind, "iframe");
        assert!(info.export.href.contains("start=90"));
        assert!(info.thumbnail_url.as_deref().unwrap().contains("abc123"));
    }
}
