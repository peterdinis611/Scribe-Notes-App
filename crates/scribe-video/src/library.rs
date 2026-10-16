//! Library video ingest API — local large files (not URL embeds).
//!
//! Storage layout under `{documentsDir}/files/`:
//! ```text
//! attachments/videos/{videoId}/
//!   source.{ext}     # copied bytes (importMode = copy)
//!   thumb.jpg        # optional ffmpeg still
//!   transcript.md    # optional ASR output
//! ```
//!
//! Reference mode stores an absolute `sourcePath` instead of copying.

use crate::detect::{has_video_ext, is_video_url};
use serde::{Deserialize, Serialize};

/// Relative folder prefix inside the Files sandbox.
pub const LIBRARY_VIDEOS_PREFIX: &str = "attachments/videos";

/// Soft guidance for UI — Rust still uses `fs::copy` (no RAM buffer) above this.
pub const LARGE_VIDEO_HINT_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VideoImportMode {
    /// Copy into `files/attachments/videos/{id}/source.ext` (portable library).
    Copy,
    /// Keep file in place; store absolute path + hash (huge files).
    Reference,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LibraryVideoStatus {
    Ready,
    Probing,
    ThumbPending,
    Transcribing,
    TranscriptReady,
    Failed,
}

impl LibraryVideoStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ready => "ready",
            Self::Probing => "probing",
            Self::ThumbPending => "thumbPending",
            Self::Transcribing => "transcribing",
            Self::TranscriptReady => "transcriptReady",
            Self::Failed => "failed",
        }
    }

    pub fn parse(raw: &str) -> Self {
        match raw {
            "probing" => Self::Probing,
            "thumbPending" => Self::ThumbPending,
            "transcribing" => Self::Transcribing,
            "transcriptReady" => Self::TranscriptReady,
            "failed" => Self::Failed,
            _ => Self::Ready,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryVideo {
    pub id: String,
    pub title: String,
    pub import_mode: VideoImportMode,
    /// Absolute path for reference mode, or absolute path to the copied file.
    pub source_path: String,
    /// Sandbox-relative path when `importMode = copy` (e.g. `attachments/videos/…/source.mp4`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rel_path: Option<String>,
    pub size_bytes: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_secs: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub codec: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumb_rel_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transcript_rel_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transcript_document_id: Option<String>,
    pub status: LibraryVideoStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Optional TipTap / library document this video is attached to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub document_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportLocalVideoRequest {
    /// Absolute path from native picker (must be PathAccessGate-granted).
    pub source_path: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub import_mode: Option<VideoImportMode>,
    #[serde(default)]
    pub document_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportLocalVideoResult {
    pub video: LibraryVideo,
    /// True when size ≥ [`LARGE_VIDEO_HINT_BYTES`].
    pub large: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProbeVideoResult {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_secs: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub codec: Option<String>,
    /// False when ffprobe is missing — UI can still play the file.
    pub available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeVideoRequest {
    pub video_id: String,
    /// Whisper / faster-whisper model id (default `base`).
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
    /// When true, also create/update a library note with the transcript.
    #[serde(default)]
    pub create_document: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSegment {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeVideoResult {
    #[serde(default)]
    pub video_id: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub segments: Vec<TranscriptSegment>,
    #[serde(default)]
    pub model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transcript_rel_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transcript_document_id: Option<String>,
}

/// NLP JSON-RPC method name.
pub const TRANSCRIBE_VIDEO_METHOD: &str = "transcribe_video";

/// Validate that a path looks like a local video file (not a remote URL).
pub fn is_local_video_path(path: &str) -> bool {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return false;
    }
    if is_video_url(trimmed) && (trimmed.starts_with("http://") || trimmed.starts_with("https://"))
    {
        return false;
    }
    has_video_ext(trimmed)
}

/// `attachments/videos/{id}`
pub fn video_dir_rel(video_id: &str) -> String {
    format!("{LIBRARY_VIDEOS_PREFIX}/{video_id}")
}

/// `attachments/videos/{id}/source.{ext}`
pub fn video_source_rel(video_id: &str, ext: &str) -> String {
    let ext = ext.trim_start_matches('.').to_ascii_lowercase();
    format!("{}/source.{}", video_dir_rel(video_id), ext)
}

pub fn video_thumb_rel(video_id: &str) -> String {
    format!("{}/thumb.jpg", video_dir_rel(video_id))
}

pub fn video_transcript_rel(video_id: &str) -> String {
    format!("{}/transcript.md", video_dir_rel(video_id))
}

/// Extension without dot, default `mp4`.
pub fn extension_of(path: &str) -> String {
    std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| !e.is_empty())
        .unwrap_or_else(|| "mp4".into())
}

pub fn title_from_path(path: &str) -> String {
    std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Video")
        .to_string()
}

pub fn default_import_mode(size_bytes: u64) -> VideoImportMode {
    if size_bytes >= LARGE_VIDEO_HINT_BYTES {
        VideoImportMode::Reference
    } else {
        VideoImportMode::Copy
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_and_local_detect() {
        assert!(is_local_video_path("/Users/me/clip.mp4"));
        assert!(!is_local_video_path("https://youtu.be/abc"));
        assert_eq!(
            video_source_rel("vid1", "MP4"),
            "attachments/videos/vid1/source.mp4"
        );
        assert_eq!(default_import_mode(10), VideoImportMode::Copy);
        assert_eq!(
            default_import_mode(LARGE_VIDEO_HINT_BYTES),
            VideoImportMode::Reference
        );
    }
}
