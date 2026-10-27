//! CRUD for `library_videos` (local large video library).

use std::fs;
use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use scribe_video::{
    validate_video_rel_path, video_dir_rel, LibraryVideo, LibraryVideoStatus, VideoImportMode,
};

use crate::storage_fs;

fn mode_str(mode: VideoImportMode) -> &'static str {
    match mode {
        VideoImportMode::Copy => "copy",
        VideoImportMode::Reference => "reference",
    }
}

fn parse_mode(raw: &str) -> VideoImportMode {
    match raw {
        "reference" => VideoImportMode::Reference,
        _ => VideoImportMode::Copy,
    }
}

fn map_row(row: &rusqlite::Row<'_>) -> Result<LibraryVideo, rusqlite::Error> {
    Ok(LibraryVideo {
        id: row.get(0)?,
        title: row.get(1)?,
        import_mode: parse_mode(&row.get::<_, String>(2)?),
        source_path: row.get(3)?,
        rel_path: row.get(4)?,
        size_bytes: row.get::<_, i64>(5)? as u64,
        content_hash: row.get(6)?,
        duration_secs: row.get(7)?,
        width: row.get::<_, Option<i64>>(8)?.map(|v| v as u32),
        height: row.get::<_, Option<i64>>(9)?.map(|v| v as u32),
        codec: row.get(10)?,
        thumb_rel_path: row.get(11)?,
        transcript_rel_path: row.get(12)?,
        transcript_document_id: row.get(13)?,
        status: LibraryVideoStatus::parse(&row.get::<_, String>(14)?),
        error: row.get(15)?,
        document_id: row.get(16)?,
        created_at: row.get(17)?,
        updated_at: row.get(18)?,
    })
}

const SELECT_COLS: &str = "id, title, import_mode, source_path, rel_path, size_bytes, content_hash,
    duration_secs, width, height, codec, thumb_rel_path, transcript_rel_path, transcript_document_id,
    status, error, document_id, created_at, updated_at";

pub fn insert_library_video(conn: &Connection, video: &LibraryVideo) -> Result<(), String> {
    conn.execute(
        &format!(
            "INSERT INTO library_videos ({SELECT_COLS})
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)"
        ),
        params![
            video.id,
            video.title,
            mode_str(video.import_mode),
            video.source_path,
            video.rel_path,
            video.size_bytes as i64,
            video.content_hash,
            video.duration_secs,
            video.width.map(|v| v as i64),
            video.height.map(|v| v as i64),
            video.codec,
            video.thumb_rel_path,
            video.transcript_rel_path,
            video.transcript_document_id,
            video.status.as_str(),
            video.error,
            video.document_id,
            video.created_at,
            video.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_library_video(conn: &Connection, video: &LibraryVideo) -> Result<(), String> {
    conn.execute(
        "UPDATE library_videos SET
            title = ?2,
            import_mode = ?3,
            source_path = ?4,
            rel_path = ?5,
            size_bytes = ?6,
            content_hash = ?7,
            duration_secs = ?8,
            width = ?9,
            height = ?10,
            codec = ?11,
            thumb_rel_path = ?12,
            transcript_rel_path = ?13,
            transcript_document_id = ?14,
            status = ?15,
            error = ?16,
            document_id = ?17,
            updated_at = ?18
         WHERE id = ?1",
        params![
            video.id,
            video.title,
            mode_str(video.import_mode),
            video.source_path,
            video.rel_path,
            video.size_bytes as i64,
            video.content_hash,
            video.duration_secs,
            video.width.map(|v| v as i64),
            video.height.map(|v| v as i64),
            video.codec,
            video.thumb_rel_path,
            video.transcript_rel_path,
            video.transcript_document_id,
            video.status.as_str(),
            video.error,
            video.document_id,
            video.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_library_video(conn: &Connection, id: &str) -> Result<Option<LibraryVideo>, String> {
    conn.query_row(
        &format!("SELECT {SELECT_COLS} FROM library_videos WHERE id = ?1"),
        params![id],
        map_row,
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn list_library_videos(conn: &Connection) -> Result<Vec<LibraryVideo>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {SELECT_COLS} FROM library_videos ORDER BY created_at DESC"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], map_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub fn delete_library_video(conn: &Connection, id: &str) -> Result<bool, String> {
    let n = conn
        .execute("DELETE FROM library_videos WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(n > 0)
}

/// Delete the row and optionally remove the copy-mode sandbox tree under `documents/files`.
pub fn delete_library_video_with_files(
    conn: &Connection,
    documents_dir: Option<&Path>,
    id: &str,
    remove_files: bool,
) -> Result<bool, String> {
    let video = get_library_video(conn, id)?;
    let Some(video) = video else {
        return Ok(false);
    };
    if remove_files {
        if let (Some(docs), Some(_)) = (documents_dir, video.rel_path.as_deref()) {
            if let Ok(files_root) = storage_fs::ensure_files_root(docs) {
                let dir_rel = video_dir_rel(&video.id);
                if let Ok(abs_dir) = storage_fs::safe_join_under(&files_root, &dir_rel) {
                    if abs_dir.exists() {
                        let _ = fs::remove_dir_all(&abs_dir);
                    }
                }
            }
        }
    }
    delete_library_video(conn, id)
}

/// Swap stale absolute video paths inside TipTap JSON after a path remap.
pub fn rewrite_video_src_in_documents(
    conn: &Connection,
    old_src: &str,
    new_src: &str,
) -> Result<(), String> {
    if old_src.is_empty() || old_src == new_src {
        return Ok(());
    }
    let old_escaped = serde_json::to_string(old_src).map_err(|e| e.to_string())?;
    let new_escaped = serde_json::to_string(new_src).map_err(|e| e.to_string())?;
    // to_string wraps in quotes; REPLACE needs the JSON string body (escaped path).
    let old_body = &old_escaped[1..old_escaped.len() - 1];
    let new_body = &new_escaped[1..new_escaped.len() - 1];
    conn.execute(
        "UPDATE documents SET content_json = REPLACE(content_json, ?1, ?2)
         WHERE instr(content_json, ?1) > 0",
        params![old_body, new_body],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// After restoring a backup, rebuild absolute `source_path` from sandbox-relative `rel_path`
/// (copy-mode imports only) and rewrite TipTap `src` attributes that still point at the old path.
pub fn remap_library_video_paths(conn: &Connection, documents_dir: &Path) -> Result<u32, String> {
    let Ok(files_root) = storage_fs::ensure_files_root(documents_dir) else {
        return Ok(0);
    };
    let videos = list_library_videos(conn)?;
    let mut remapped = 0u32;
    let now = chrono::Utc::now().timestamp();
    for mut video in videos {
        let Some(rel) = video.rel_path.clone() else {
            continue;
        };
        if validate_video_rel_path(&rel, &video.id).is_err() {
            continue;
        }
        let Ok(abs) = storage_fs::safe_join_under(&files_root, &rel) else {
            continue;
        };
        if !abs.is_file() {
            continue;
        }
        let resolved = abs.to_string_lossy().into_owned();
        if video.source_path == resolved {
            continue;
        }
        let old_src = video.source_path.clone();
        video.source_path = resolved.clone();
        video.updated_at = now;
        update_library_video(conn, &video)?;
        rewrite_video_src_in_documents(conn, &old_src, &resolved)?;
        remapped += 1;
    }
    Ok(remapped)
}
