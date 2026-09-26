use crate::db::DbState;
use crate::images::{optimize_image_bytes, OptimizeOptions};
use crate::storage;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::path::Path;
use tauri::{AppHandle, State};
use uuid::Uuid;

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
