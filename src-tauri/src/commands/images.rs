use crate::db::DbState;
use crate::storage;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::path::Path;
use tauri::{AppHandle, State};
use uuid::Uuid;

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

    let allowed = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
    if !allowed.contains(&ext.as_str()) {
        return Err("Podporované formáty: PNG, JPG, GIF, WEBP, SVG".to_string());
    }

    let payload = data_base64
        .split_once(',')
        .map(|(_, data)| data.to_string())
        .unwrap_or(data_base64);

    let bytes = STANDARD
        .decode(payload)
        .map_err(|e| format!("Neplatný obrázok: {e}"))?;

    let unique = format!("{}.{}", Uuid::new_v4(), ext);
    let path = assets_dir.join(unique);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}
