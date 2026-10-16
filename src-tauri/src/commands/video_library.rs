//! Local large-video library API (Rust store + optional Python ASR).

use std::fs::{self, File};
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

use chrono::Utc;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::State;
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use crate::db::DbState;
use crate::nlp::NlpSidecar;
use crate::security::PathAccessGate;
use crate::storage;
use scribe_core::db::{
    delete_library_video, get_library_video, insert_library_video, list_library_videos,
    update_library_video,
};
use scribe_core::storage_fs;
use scribe_video::{
    default_import_mode, extension_of, is_local_video_path, title_from_path, video_dir_rel,
    video_source_rel, video_thumb_rel, video_transcript_rel, ImportLocalVideoRequest,
    ImportLocalVideoResult, LibraryVideo, LibraryVideoStatus, ProbeVideoResult,
    TranscribeVideoRequest, TranscribeVideoResult, VideoImportMode, LARGE_VIDEO_HINT_BYTES,
    TRANSCRIBE_VIDEO_METHOD,
};

fn now_ts() -> i64 {
    Utc::now().timestamp()
}

fn hash_file(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 1024 * 64];
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn documents_files_root(app: &tauri::AppHandle, conn: &rusqlite::Connection) -> Result<PathBuf, String> {
    let dir = storage::get_documents_dir(app, conn)?;
    storage_fs::ensure_files_root(&dir)
}

/// Native picker for a local video file (grants PathAccessGate).
#[tauri::command]
pub fn pick_local_video(
    app: tauri::AppHandle,
    gate: State<'_, PathAccessGate>,
) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter(
            "Video",
            &["mp4", "webm", "mov", "mkv", "m4v", "ogv", "ogg", "m3u8"],
        )
        .set_title("Choose a video")
        .blocking_pick_file()
        .map(|p| PathBuf::from(p.to_string()));
    let Some(path) = picked else {
        return Ok(None);
    };
    if !is_local_video_path(&path.to_string_lossy()) {
        return Err("Selected file is not a supported video.".into());
    }
    gate.grant_from_picker(&path);
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Import a granted local video (copy or reference). Never loads the whole file into RAM.
#[tauri::command]
pub fn import_local_video(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    gate: State<'_, PathAccessGate>,
    request: ImportLocalVideoRequest,
) -> Result<ImportLocalVideoResult, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let source = PathBuf::from(request.source_path.trim());
    let validated = gate.validate_read(&app, &conn, &source)?;
    if !is_local_video_path(&validated.to_string_lossy()) {
        return Err("Path is not a supported video file.".into());
    }

    let meta = fs::metadata(&validated).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Source path is not a file.".into());
    }
    let size_bytes = meta.len();
    let mode = request
        .import_mode
        .unwrap_or_else(|| default_import_mode(size_bytes));
    let id = Uuid::new_v4().to_string();
    let title = request
        .title
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| title_from_path(&validated.to_string_lossy()));
    let ext = extension_of(&validated.to_string_lossy());
    let content_hash = hash_file(&validated).ok();
    let ts = now_ts();

    let (source_path, rel_path) = match mode {
        VideoImportMode::Copy => {
            let files_root = documents_files_root(&app, &conn)?;
            let rel_dir = video_dir_rel(&id);
            let abs_dir = storage_fs::safe_join_under(&files_root, &rel_dir)?;
            fs::create_dir_all(&abs_dir).map_err(|e| e.to_string())?;
            let rel = video_source_rel(&id, &ext);
            let dest = storage_fs::safe_join_under(&files_root, &rel)?;
            fs::copy(&validated, &dest).map_err(|e| format!("Copy failed: {e}"))?;
            (dest.to_string_lossy().into_owned(), Some(rel))
        }
        VideoImportMode::Reference => (validated.to_string_lossy().into_owned(), None),
    };

    let video = LibraryVideo {
        id,
        title,
        import_mode: mode,
        source_path,
        rel_path,
        size_bytes,
        content_hash,
        duration_secs: None,
        width: None,
        height: None,
        codec: None,
        thumb_rel_path: None,
        transcript_rel_path: None,
        transcript_document_id: None,
        status: LibraryVideoStatus::Ready,
        error: None,
        document_id: request.document_id,
        created_at: ts,
        updated_at: ts,
    };
    insert_library_video(&conn, &video)?;
    Ok(ImportLocalVideoResult {
        large: size_bytes >= LARGE_VIDEO_HINT_BYTES,
        video,
    })
}

#[tauri::command]
pub fn list_library_videos_cmd(state: State<'_, DbState>) -> Result<Vec<LibraryVideo>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    list_library_videos(&conn)
}

#[tauri::command]
pub fn get_library_video_cmd(
    state: State<'_, DbState>,
    id: String,
) -> Result<Option<LibraryVideo>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    get_library_video(&conn, &id)
}

#[tauri::command]
pub fn delete_library_video_cmd(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    id: String,
    remove_files: Option<bool>,
) -> Result<bool, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let Some(video) = get_library_video(&conn, &id)? else {
        return Ok(false);
    };
    if remove_files.unwrap_or(true) {
        if let Some(rel) = video.rel_path.as_deref() {
            let files_root = documents_files_root(&app, &conn)?;
            let dir_rel = video_dir_rel(&id);
            let abs_dir = storage_fs::safe_join_under(&files_root, &dir_rel)?;
            if abs_dir.exists() {
                let _ = fs::remove_dir_all(&abs_dir);
            } else {
                let _ = rel;
            }
        }
    }
    delete_library_video(&conn, &id)
}

/// Best-effort ffprobe metadata (available=false when binary missing).
#[tauri::command]
pub fn probe_library_video(
    state: State<'_, DbState>,
    id: String,
) -> Result<ProbeVideoResult, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let Some(mut video) = get_library_video(&conn, &id)? else {
        return Err("Video not found".into());
    };
    video.status = LibraryVideoStatus::Probing;
    video.updated_at = now_ts();
    update_library_video(&conn, &video)?;

    let probe = run_ffprobe(Path::new(&video.source_path));
    if probe.available {
        video.duration_secs = probe.duration_secs;
        video.width = probe.width;
        video.height = probe.height;
        video.codec = probe.codec.clone();
        video.status = LibraryVideoStatus::Ready;
        video.error = None;
    } else {
        video.status = LibraryVideoStatus::Ready;
        video.error = None;
    }
    video.updated_at = now_ts();
    update_library_video(&conn, &video)?;
    drop(conn);
    Ok(probe)
}

fn run_ffprobe(path: &Path) -> ProbeVideoResult {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,codec_name:format=duration",
            "-of",
            "json",
            &path.to_string_lossy(),
        ])
        .output();
    let Ok(out) = output else {
        return ProbeVideoResult {
            available: false,
            ..Default::default()
        };
    };
    if !out.status.success() {
        return ProbeVideoResult {
            available: false,
            ..Default::default()
        };
    }
    #[derive(Deserialize)]
    struct Ff {
        streams: Option<Vec<FfStream>>,
        format: Option<FfFormat>,
    }
    #[derive(Deserialize)]
    struct FfStream {
        width: Option<u32>,
        height: Option<u32>,
        codec_name: Option<String>,
    }
    #[derive(Deserialize)]
    struct FfFormat {
        duration: Option<String>,
    }
    let parsed: Ff = match serde_json::from_slice(&out.stdout) {
        Ok(v) => v,
        Err(_) => {
            return ProbeVideoResult {
                available: false,
                ..Default::default()
            }
        }
    };
    let stream = parsed.streams.and_then(|mut s| s.pop());
    ProbeVideoResult {
        duration_secs: parsed
            .format
            .and_then(|f| f.duration)
            .and_then(|d| d.parse().ok()),
        width: stream.as_ref().and_then(|s| s.width),
        height: stream.as_ref().and_then(|s| s.height),
        codec: stream.and_then(|s| s.codec_name),
        available: true,
    }
}

/// Extract a JPEG thumbnail via ffmpeg into the Files sandbox.
#[tauri::command]
pub fn generate_library_video_thumbnail(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    id: String,
    at_secs: Option<f64>,
) -> Result<LibraryVideo, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let Some(mut video) = get_library_video(&conn, &id)? else {
        return Err("Video not found".into());
    };
    let files_root = documents_files_root(&app, &conn)?;
    let dir_rel = video_dir_rel(&id);
    let abs_dir = storage_fs::safe_join_under(&files_root, &dir_rel)?;
    fs::create_dir_all(&abs_dir).map_err(|e| e.to_string())?;
    let thumb_rel = video_thumb_rel(&id);
    let thumb_abs = storage_fs::safe_join_under(&files_root, &thumb_rel)?;
    let seek = at_secs.unwrap_or(1.0).max(0.0);

    video.status = LibraryVideoStatus::ThumbPending;
    video.updated_at = now_ts();
    update_library_video(&conn, &video)?;

    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-ss",
            &format!("{seek:.3}"),
            "-i",
            &video.source_path,
            "-frames:v",
            "1",
            "-q:v",
            "3",
            &thumb_abs.to_string_lossy(),
        ])
        .status()
        .map_err(|e| format!("ffmpeg not available: {e}"))?;
    if !status.success() {
        video.status = LibraryVideoStatus::Failed;
        video.error = Some("ffmpeg thumbnail failed".into());
        video.updated_at = now_ts();
        update_library_video(&conn, &video)?;
        return Err("ffmpeg thumbnail failed".into());
    }

    video.thumb_rel_path = Some(thumb_rel);
    video.status = LibraryVideoStatus::Ready;
    video.error = None;
    video.updated_at = now_ts();
    update_library_video(&conn, &video)?;
    Ok(video)
}

/// Run Python ASR (`transcribe_video`) on a library video; stores transcript.md.
#[tauri::command]
pub fn transcribe_library_video(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
    sidecar: State<'_, NlpSidecar>,
    request: TranscribeVideoRequest,
) -> Result<TranscribeVideoResult, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let Some(mut video) = get_library_video(&conn, &request.video_id)? else {
        return Err("Video not found".into());
    };

    video.status = LibraryVideoStatus::Transcribing;
    video.error = None;
    video.updated_at = now_ts();
    update_library_video(&conn, &video)?;

    // Prefer sandbox-relative path for Python; fall back to absolute for reference imports.
    let params = serde_json::json!({
        "relPath": video.rel_path,
        "sourcePath": video.source_path,
        "model": request.model.clone().unwrap_or_else(|| "base".into()),
        "language": request.language,
    });

    let _ = TRANSCRIBE_VIDEO_METHOD;
    let result_value = sidecar.transcribe_video(params).map_err(|e| {
        let mut failed = video.clone();
        failed.status = LibraryVideoStatus::Failed;
        failed.error = Some(e.clone());
        failed.updated_at = now_ts();
        let _ = update_library_video(&conn, &failed);
        e
    })?;

    let mut parsed: TranscribeVideoResult =
        serde_json::from_value(result_value).map_err(|e| e.to_string())?;
    parsed.video_id = video.id.clone();

    let files_root = documents_files_root(&app, &conn)?;
    let dir_rel = video_dir_rel(&video.id);
    let abs_dir = storage_fs::safe_join_under(&files_root, &dir_rel)?;
    fs::create_dir_all(&abs_dir).map_err(|e| e.to_string())?;
    let transcript_rel = video_transcript_rel(&video.id);
    let transcript_abs = storage_fs::safe_join_under(&files_root, &transcript_rel)?;
    let mut file = File::create(&transcript_abs).map_err(|e| e.to_string())?;
    file.write_all(parsed.text.as_bytes())
        .map_err(|e| e.to_string())?;

    video.transcript_rel_path = Some(transcript_rel.clone());
    parsed.transcript_rel_path = Some(transcript_rel);
    video.status = LibraryVideoStatus::TranscriptReady;
    video.error = None;
    video.updated_at = now_ts();
    update_library_video(&conn, &video)?;

    // Optional note creation is left to the FE (needs editor UX); flag stays on request.
    let _ = request.create_document;

    Ok(parsed)
}

/// Playback helper: absolute path suitable for `convertFileSrc`.
#[tauri::command]
pub fn library_video_playback_path(
    state: State<'_, DbState>,
    id: String,
) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let video = get_library_video(&conn, &id)?.ok_or_else(|| "Video not found".to_string())?;
    Ok(video.source_path)
}
