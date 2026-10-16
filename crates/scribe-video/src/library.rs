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

use crate::detect::{has_video_ext, is_video_url, VIDEO_FILE_EXT};
use serde::{Deserialize, Serialize};

/// Relative folder prefix inside the Files sandbox.
pub const LIBRARY_VIDEOS_PREFIX: &str = "attachments/videos";

/// Soft guidance for UI — Rust still uses `fs::copy` (no RAM buffer) above this.
pub const LARGE_VIDEO_HINT_BYTES: u64 = 100 * 1024 * 1024;

/// Hard cap for copy-mode import (above this, require `reference`).
pub const MAX_COPY_BYTES: u64 = 2u64 * 1024 * 1024 * 1024;

/// Reject empty / tiny “videos” (corrupt picker / placeholder).
pub const MIN_VIDEO_BYTES: u64 = 64;

pub const MAX_VIDEO_TITLE_CHARS: usize = 200;
pub const MAX_VIDEO_ID_CHARS: usize = 64;
pub const MAX_THUMB_SEEK_SECS: f64 = 86_400.0;

/// Whisper / faster-whisper model ids accepted by the NLP sidecar.
pub const ALLOWED_WHISPER_MODELS: &[&str] = &[
    "tiny",
    "tiny.en",
    "base",
    "base.en",
    "small",
    "small.en",
    "medium",
    "medium.en",
    "large-v2",
    "large-v3",
    "distil-large-v3",
];

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
    if trimmed.is_empty() || trimmed.contains('\0') {
        return false;
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return false;
    }
    if is_video_url(trimmed) {
        return false;
    }
    has_video_ext(trimmed)
}

/// Safe path segment for `{attachments/videos}/{id}` (UUID / alphanumeric).
pub fn validate_video_id(id: &str) -> Result<(), String> {
    let id = id.trim();
    if id.is_empty() {
        return Err("Video id is required.".into());
    }
    if id.len() > MAX_VIDEO_ID_CHARS {
        return Err(format!("Video id exceeds {MAX_VIDEO_ID_CHARS} characters."));
    }
    if id.contains("..") || id.contains('/') || id.contains('\\') {
        return Err("Video id must not contain path separators.".into());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Video id contains invalid characters.".into());
    }
    Ok(())
}

/// Normalize / clamp a display title.
pub fn validate_title(raw: &str) -> Result<String, String> {
    let title = raw.trim();
    if title.is_empty() {
        return Err("Title must not be empty.".into());
    }
    if title.len() > MAX_VIDEO_TITLE_CHARS {
        return Err(format!(
            "Title exceeds {MAX_VIDEO_TITLE_CHARS} characters."
        ));
    }
    if title.contains('\0') {
        return Err("Title contains invalid characters.".into());
    }
    Ok(title.to_string())
}

/// Optional document id (same charset rules as video id).
pub fn validate_optional_document_id(id: Option<&str>) -> Result<Option<String>, String> {
    let Some(raw) = id.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    validate_video_id(raw)?;
    Ok(Some(raw.to_string()))
}

pub fn validate_video_extension(ext: &str) -> Result<String, String> {
    let ext = ext.trim_start_matches('.').to_ascii_lowercase();
    if ext.is_empty() {
        return Err("Missing video file extension.".into());
    }
    let dotted = format!(".{ext}");
    if !VIDEO_FILE_EXT.iter().any(|e| *e == dotted.as_str()) {
        return Err(format!("Unsupported video extension: .{ext}"));
    }
    Ok(ext)
}

pub fn validate_import_source_path(path: &str) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Source path is required.".into());
    }
    if trimmed.contains('\0') {
        return Err("Source path contains invalid characters.".into());
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Err("Remote URLs cannot be imported as local videos.".into());
    }
    if !is_local_video_path(trimmed) {
        return Err("Path is not a supported video file.".into());
    }
    Ok(())
}

pub fn validate_import_size(size_bytes: u64, mode: VideoImportMode) -> Result<(), String> {
    if size_bytes < MIN_VIDEO_BYTES {
        return Err(format!(
            "Video file is too small (min {MIN_VIDEO_BYTES} bytes)."
        ));
    }
    if mode == VideoImportMode::Copy && size_bytes > MAX_COPY_BYTES {
        return Err(format!(
            "File is too large to copy (max {} bytes). Use importMode=reference.",
            MAX_COPY_BYTES
        ));
    }
    Ok(())
}

pub fn normalize_whisper_model(model: Option<&str>) -> Result<String, String> {
    let raw = model.map(str::trim).filter(|s| !s.is_empty()).unwrap_or("base");
    let lower = raw.to_ascii_lowercase();
    if !ALLOWED_WHISPER_MODELS.iter().any(|m| *m == lower.as_str()) {
        return Err(format!(
            "Unsupported whisper model '{raw}'. Allowed: {}.",
            ALLOWED_WHISPER_MODELS.join(", ")
        ));
    }
    Ok(lower)
}

/// ISO-ish language tag (`sk`, `en`, `en-us`).
pub fn normalize_language_code(lang: Option<&str>) -> Result<Option<String>, String> {
    let Some(raw) = lang.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    let lower = raw.to_ascii_lowercase();
    let ok = match lower.split_once('-') {
        None => lower.len() == 2 && lower.chars().all(|c| c.is_ascii_lowercase()),
        Some((a, b)) => {
            a.len() == 2
                && a.chars().all(|c| c.is_ascii_lowercase())
                && (2..=8).contains(&b.len())
                && b.chars().all(|c| c.is_ascii_lowercase())
        }
    };
    if !ok {
        return Err(format!(
            "Invalid language code '{raw}' (expected ISO 639-1, e.g. sk or en-us)."
        ));
    }
    Ok(Some(lower))
}

pub fn validate_thumb_seek(at_secs: Option<f64>) -> Result<f64, String> {
    let seek = at_secs.unwrap_or(1.0);
    if !seek.is_finite() {
        return Err("Thumbnail seek must be a finite number.".into());
    }
    if seek < 0.0 {
        return Err("Thumbnail seek must be ≥ 0.".into());
    }
    if seek > MAX_THUMB_SEEK_SECS {
        return Err(format!(
            "Thumbnail seek exceeds {MAX_THUMB_SEEK_SECS} seconds."
        ));
    }
    Ok(seek)
}

pub fn validate_transcribe_request(
    request: &TranscribeVideoRequest,
) -> Result<(String, Option<String>), String> {
    validate_video_id(&request.video_id)?;
    let model = normalize_whisper_model(request.model.as_deref())?;
    let language = normalize_language_code(request.language.as_deref())?;
    Ok((model, language))
}

/// Ensure a sandbox-relative path stays under this video’s folder.
pub fn validate_video_rel_path(rel: &str, video_id: &str) -> Result<(), String> {
    validate_video_id(video_id)?;
    let rel = rel.trim().trim_start_matches('/');
    if rel.is_empty() || rel.contains('\0') || rel.contains("..") {
        return Err("Invalid video relative path.".into());
    }
    let prefix = format!("{LIBRARY_VIDEOS_PREFIX}/{video_id}/");
    if !rel.starts_with(&prefix) && rel != format!("{LIBRARY_VIDEOS_PREFIX}/{video_id}") {
        return Err("Relative path is outside this video’s folder.".into());
    }
    Ok(())
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
    let stem = std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Video");
    let mut title = stem.to_string();
    if title.len() > MAX_VIDEO_TITLE_CHARS {
        title.truncate(MAX_VIDEO_TITLE_CHARS);
    }
    title
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
        assert!(!is_local_video_path("http://example.com/a.mp4"));
        assert!(!is_local_video_path(""));
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

    #[test]
    fn validates_ids_titles_and_models() {
        assert!(validate_video_id("a1b2c3d4-e5f6-7890-abcd-ef1234567890").is_ok());
        assert!(validate_video_id("../etc").is_err());
        assert!(validate_video_id("bad/id").is_err());
        assert!(validate_title("Clip").is_ok());
        assert!(validate_title("").is_err());
        assert!(validate_title(&"x".repeat(MAX_VIDEO_TITLE_CHARS + 1)).is_err());
        assert_eq!(normalize_whisper_model(None).unwrap(), "base");
        assert!(normalize_whisper_model(Some("nope")).is_err());
        assert_eq!(
            normalize_language_code(Some("SK")).unwrap().as_deref(),
            Some("sk")
        );
        assert!(normalize_language_code(Some("english")).is_err());
        assert!(validate_thumb_seek(Some(f64::NAN)).is_err());
        assert!(validate_thumb_seek(Some(-1.0)).is_err());
        assert_eq!(validate_thumb_seek(Some(2.5)).unwrap(), 2.5);
        assert!(validate_import_size(MIN_VIDEO_BYTES, VideoImportMode::Copy).is_ok());
        assert!(validate_import_size(10, VideoImportMode::Copy).is_err());
        assert!(validate_import_size(MAX_COPY_BYTES + 1, VideoImportMode::Copy).is_err());
        assert!(validate_import_size(MAX_COPY_BYTES + 1, VideoImportMode::Reference).is_ok());
        assert!(validate_video_rel_path("attachments/videos/vid1/source.mp4", "vid1").is_ok());
        assert!(validate_video_rel_path("attachments/videos/other/source.mp4", "vid1").is_err());
    }
}
