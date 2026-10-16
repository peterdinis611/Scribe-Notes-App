use crate::db::DbState;
use crate::images::{optimize_image_bytes, remove_background_bytes, OptimizeOptions};
use crate::security::PathAccessGate;
use crate::storage;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::OptionalExtension;
use scribe_core::db::{delete_library_video, get_library_video, list_library_videos};
use scribe_core::storage_fs;
use scribe_video::{has_video_ext, LIBRARY_VIDEOS_PREFIX};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAsset {
    pub path: String,
    pub file_name: String,
    pub extension: String,
    pub kind: String,
    pub size_bytes: u64,
    pub document_id: String,
    pub document_title: Option<String>,
    pub modified_at: Option<i64>,
}

fn document_title_for(conn: &rusqlite::Connection, document_id: &str) -> Result<Option<String>, String> {
    if document_id.is_empty() {
        return Ok(None);
    }
    conn.query_row(
        "SELECT title FROM documents WHERE id = ?1 AND deleted_at IS NULL",
        rusqlite::params![document_id],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn push_file_asset(
    assets: &mut Vec<LibraryAsset>,
    path: &Path,
    document_id: String,
    document_title: Option<String>,
    kind_override: Option<&str>,
) {
    if !path.is_file() {
        return;
    }
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let meta = std::fs::metadata(path).ok();
    let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
    let modified_at = meta.as_ref().and_then(modified_at_secs);
    let kind = kind_override
        .map(str::to_string)
        .unwrap_or_else(|| scribe_ui::asset_kind(&extension).to_string());
    assets.push(LibraryAsset {
        path: path.to_string_lossy().to_string(),
        file_name,
        extension,
        kind,
        size_bytes,
        document_id,
        document_title,
        modified_at,
    });
}

/// Index local library videos (copy + reference) into Storage mode.
fn append_library_videos(
    conn: &rusqlite::Connection,
    documents_dir: &Path,
    assets: &mut Vec<LibraryAsset>,
) -> Result<(), String> {
    let mut seen_paths = HashSet::new();
    for video in list_library_videos(conn)? {
        let path = PathBuf::from(&video.source_path);
        seen_paths.insert(path.to_string_lossy().into_owned());
        let document_id = video.document_id.clone().unwrap_or_default();
        let document_title = if document_id.is_empty() {
            None
        } else {
            document_title_for(conn, &document_id)?
        };
        if path.is_file() {
            push_file_asset(assets, &path, document_id, document_title, Some("video"));
        } else {
            // Keep missing reference/copy rows visible so Storage mode can clean them up.
            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            assets.push(LibraryAsset {
                path: video.source_path,
                file_name: if video.title.trim().is_empty() {
                    path.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("video")
                        .to_string()
                } else {
                    video.title
                },
                extension,
                kind: "video".into(),
                size_bytes: video.size_bytes,
                document_id,
                document_title,
                modified_at: Some(video.updated_at),
            });
        }
    }

    // Orphan files under files/attachments/videos/{id}/ not tracked in SQLite.
    let videos_root = documents_dir.join("files").join(LIBRARY_VIDEOS_PREFIX);
    if !videos_root.is_dir() {
        return Ok(());
    }
    for entry in std::fs::read_dir(&videos_root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let video_id = match dir.file_name().and_then(|n| n.to_str()) {
            Some(id) if !id.is_empty() => id.to_string(),
            _ => continue,
        };
        if get_library_video(conn, &video_id)?.is_some() {
            continue;
        }
        for file_entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
            let file_entry = file_entry.map_err(|e| e.to_string())?;
            let path = file_entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path.to_string_lossy();
            if seen_paths.contains(name.as_ref()) {
                continue;
            }
            // Prefer source.* video files; skip thumb/transcript sidecars for orphans.
            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !(file_name.starts_with("source.") || has_video_ext(&name)) {
                continue;
            }
            seen_paths.insert(name.into_owned());
            push_file_asset(assets, &path, String::new(), None, Some("video"));
        }
    }
    Ok(())
}

fn modified_at_secs(meta: &std::fs::Metadata) -> Option<i64> {
    meta.modified().ok().and_then(|time| {
        time.duration_since(SystemTime::UNIX_EPOCH)
            .ok()
            .map(|d| d.as_secs() as i64)
    })
}

fn decode_payload(data_base64: &str) -> Result<Vec<u8>, String> {
    let payload = data_base64
        .split_once(',')
        .map(|(_, data)| data.to_string())
        .unwrap_or_else(|| data_base64.to_string());
    STANDARD
        .decode(payload)
        .map_err(|e| format!("Neplatné dáta: {e}"))
}

fn looks_like_lottie_json(bytes: &[u8]) -> bool {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(bytes) else {
        return false;
    };
    let obj = match value.as_object() {
        Some(obj) => obj,
        None => return false,
    };
    // Bodymovin / Lottie JSON: version + layers (or assets).
    obj.contains_key("layers")
        && (obj.contains_key("v") || obj.contains_key("fr") || obj.contains_key("ip"))
}

fn looks_like_lottie_zip(bytes: &[u8]) -> bool {
    // ZIP local file header
    bytes.len() >= 4 && bytes[0] == 0x50 && bytes[1] == 0x4B && (bytes[2] == 0x03 || bytes[2] == 0x05)
}

fn looks_like_glb(bytes: &[u8]) -> bool {
    // glTF binary magic: "glTF"
    bytes.len() >= 12 && bytes[0] == b'g' && bytes[1] == b'l' && bytes[2] == b'T' && bytes[3] == b'F'
}

fn looks_like_gltf_json(bytes: &[u8]) -> bool {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(bytes) else {
        return false;
    };
    value
        .as_object()
        .is_some_and(|obj| obj.contains_key("asset") && (obj.contains_key("meshes") || obj.contains_key("nodes") || obj.contains_key("scenes")))
}

#[tauri::command]
pub fn save_document_image(
    app: AppHandle,
    state: State<'_, DbState>,
    document_id: String,
    file_name: String,
    data_base64: String,
) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let dir = storage::get_documents_dir(&app, &conn)?;
    let assets_dir = dir.join("assets").join(&document_id);
    std::fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;

    let ext = Path::new(&file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();

    let allowed = [
        "png", "jpg", "jpeg", "gif", "webp", "svg", "json", "lottie", "apng", "glb", "gltf", "usdz",
    ];
    if !allowed.contains(&ext.as_str()) {
        return Err(
            "Podporované formáty: PNG, JPG, GIF, WEBP, SVG, Lottie (.json / .lottie), 3D (.glb / .gltf / .usdz)"
                .to_string(),
        );
    }

    let bytes = decode_payload(&data_base64)?;

    let (out_bytes, out_ext) = match ext.as_str() {
        "svg" => {
            // Keep vector markup as-is (already handled inside optimize, but skip decode path).
            let optimized = optimize_image_bytes(&bytes, "svg", OptimizeOptions::default())?;
            (optimized.bytes, optimized.extension)
        }
        "json" => {
            if !looks_like_lottie_json(&bytes) {
                return Err("Súbor .json nie je platná Lottie animácia".to_string());
            }
            if bytes.len() > 15 * 1024 * 1024 {
                return Err("Lottie JSON je príliš veľký (max 15 MB)".to_string());
            }
            (bytes, "json".into())
        }
        "lottie" => {
            if !looks_like_lottie_zip(&bytes) {
                return Err("Súbor .lottie musí byť platný DotLottie (ZIP) archív".to_string());
            }
            if bytes.len() > 20 * 1024 * 1024 {
                return Err("Lottie súbor je príliš veľký (max 20 MB)".to_string());
            }
            (bytes, "lottie".into())
        }
        "glb" | "gltf" | "usdz" => {
            if bytes.len() < 16 {
                return Err("3D súbor je príliš malý alebo poškodený".to_string());
            }
            if ext == "glb" && !looks_like_glb(&bytes) {
                return Err("Súbor .glb nie je platný glTF binary kontajner".to_string());
            }
            if ext == "gltf" && !looks_like_gltf_json(&bytes) {
                return Err("Súbor .gltf nie je platný glTF JSON".to_string());
            }
            if bytes.len() > 80 * 1024 * 1024 {
                return Err("3D model je príliš veľký (max 80 MB)".to_string());
            }
            (bytes, ext.clone())
        }
        _ => {
            let optimized = optimize_image_bytes(&bytes, &ext, OptimizeOptions::default())?;
            if optimized.changed {
                log::debug!(
                    "image optimized: {} → {} bytes ({})",
                    bytes.len(),
                    optimized.bytes.len(),
                    optimized.extension
                );
            }
            (optimized.bytes, optimized.extension)
        }
    };

    let unique = format!("{}.{}", Uuid::new_v4(), out_ext);
    let path = assets_dir.join(unique);
    std::fs::write(&path, &out_bytes).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

/// Remove a near-solid edge-connected background; returns a new PNG under `assets/{documentId}/`.
#[tauri::command]
pub fn remove_image_background(
    app: AppHandle,
    state: State<'_, DbState>,
    gate: State<'_, PathAccessGate>,
    document_id: String,
    image_path: String,
    tolerance: Option<u32>,
) -> Result<String, String> {
    if document_id.trim().is_empty() {
        return Err("documentId is required".into());
    }
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let path = PathBuf::from(&image_path);
    let validated = if let Ok(temp) = PathAccessGate::validate_temp_file(&path) {
        temp
    } else {
        gate.validate_read(&app, &conn, &path)?
    };
    if !validated.is_file() {
        return Err("Image file not found.".into());
    }
    let bytes = std::fs::read(&validated).map_err(|e| format!("Read failed: {e}"))?;
    let png = remove_background_bytes(&bytes, tolerance)?;

    let dir = storage::get_documents_dir(&app, &conn)?;
    let assets_dir = dir.join("assets").join(document_id.trim());
    std::fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;
    let out_path = assets_dir.join(format!("bg-removed-{}.png", Uuid::new_v4()));
    std::fs::write(&out_path, &png).map_err(|e| e.to_string())?;
    Ok(out_path.to_string_lossy().to_string())
}

/// Lists media under `{documentsDir}/assets/{documentId}/` plus local library videos.
#[tauri::command]
pub fn list_library_assets(
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Vec<LibraryAsset>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let documents_dir = storage::get_documents_dir(&app, &conn)?;
    let assets_root = documents_dir.join("assets");

    let mut assets = Vec::new();
    if assets_root.is_dir() {
        for entry in std::fs::read_dir(&assets_root).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let doc_path = entry.path();
            if !doc_path.is_dir() {
                continue;
            }
            let document_id = match doc_path.file_name().and_then(|n| n.to_str()) {
                Some(id) if !id.is_empty() => id.to_string(),
                _ => continue,
            };

            let document_title = document_title_for(&conn, &document_id)?;

            for file_entry in std::fs::read_dir(&doc_path).map_err(|e| e.to_string())? {
                let file_entry = file_entry.map_err(|e| e.to_string())?;
                push_file_asset(
                    &mut assets,
                    &file_entry.path(),
                    document_id.clone(),
                    document_title.clone(),
                    None,
                );
            }
        }
    }

    append_library_videos(&conn, &documents_dir, &mut assets)?;

    assets.sort_by(|a, b| {
        b.modified_at
            .cmp(&a.modified_at)
            .then_with(|| a.file_name.cmp(&b.file_name))
    });
    Ok(assets)
}

fn library_video_id_from_path(documents_dir: &Path, path: &Path) -> Option<String> {
    let files_root = storage_fs::ensure_files_root(documents_dir).ok()?;
    let videos_root = storage_fs::safe_join_under(&files_root, LIBRARY_VIDEOS_PREFIX).ok()?;
    let canon_videos = std::fs::canonicalize(&videos_root).unwrap_or(videos_root);
    let canon_path = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let rel = canon_path.strip_prefix(&canon_videos).ok()?;
    rel.components()
        .next()
        .and_then(|c| c.as_os_str().to_str())
        .filter(|id| !id.is_empty())
        .map(str::to_string)
}

/// Deletes an asset under `assets/…` or a library video (copy sandbox / DB row).
#[tauri::command]
pub fn delete_library_asset(
    app: AppHandle,
    state: State<'_, DbState>,
    gate: State<'_, PathAccessGate>,
    path: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let documents_dir = storage::get_documents_dir(&app, &conn)?;
    let path_buf = PathBuf::from(&path);

    // Library video by absolute source_path (copy or reference).
    if let Some(video) = list_library_videos(&conn)?
        .into_iter()
        .find(|v| v.source_path == path)
    {
        if video.rel_path.is_some() {
            if let Some(rel) = video.rel_path.as_deref() {
                let files_root = storage_fs::ensure_files_root(&documents_dir)?;
                let abs = storage_fs::safe_join_under(&files_root, rel)?;
                if abs.is_file() {
                    let _ = gate.validate_read(&app, &conn, &abs)?;
                }
            }
            let dir_rel = format!("{LIBRARY_VIDEOS_PREFIX}/{}", video.id);
            if let Ok(files_root) = storage_fs::ensure_files_root(&documents_dir) {
                if let Ok(abs_dir) = storage_fs::safe_join_under(&files_root, &dir_rel) {
                    if abs_dir.is_dir() {
                        let _ = std::fs::remove_dir_all(&abs_dir);
                    }
                }
            }
        }
        // Reference mode: drop the index row only — never delete the external file.
        delete_library_video(&conn, &video.id)?;
        return Ok(());
    }

    // Orphan / sidecars under files/attachments/videos/{id}/…
    if let Some(video_id) = library_video_id_from_path(&documents_dir, &path_buf) {
        if get_library_video(&conn, &video_id)?.is_some() {
            let dir_rel = format!("{LIBRARY_VIDEOS_PREFIX}/{video_id}");
            let files_root = storage_fs::ensure_files_root(&documents_dir)?;
            if let Ok(abs_dir) = storage_fs::safe_join_under(&files_root, &dir_rel) {
                if abs_dir.is_dir() {
                    let _ = gate.validate_read(&app, &conn, &abs_dir)?;
                    let _ = std::fs::remove_dir_all(&abs_dir);
                }
            }
            delete_library_video(&conn, &video_id)?;
            return Ok(());
        }
        let validated = gate.validate_read(&app, &conn, &path_buf)?;
        if validated.is_file() {
            std::fs::remove_file(&validated).map_err(|e| format!("Could not delete asset: {e}"))?;
            if let Some(parent) = validated.parent() {
                if parent.is_dir()
                    && std::fs::read_dir(parent)
                        .map(|mut d| d.next().is_none())
                        .unwrap_or(false)
                {
                    let _ = std::fs::remove_dir(parent);
                }
            }
        }
        return Ok(());
    }

    let validated = gate.validate_read(&app, &conn, &path_buf)?;
    let docs_canon = std::fs::canonicalize(&documents_dir)
        .unwrap_or_else(|_| documents_dir.clone());
    let assets_root = docs_canon.join("assets");

    if !validated.starts_with(&assets_root) {
        return Err("Asset path is outside the library assets / videos folders.".to_string());
    }
    if !validated.is_file() {
        return Err("Asset file not found.".to_string());
    }
    std::fs::remove_file(&validated).map_err(|e| format!("Could not delete asset: {e}"))?;

    if let Some(parent) = validated.parent() {
        if parent.is_dir()
            && std::fs::read_dir(parent)
                .map(|mut d| d.next().is_none())
                .unwrap_or(false)
        {
            let _ = std::fs::remove_dir(parent);
        }
    }
    Ok(())
}
