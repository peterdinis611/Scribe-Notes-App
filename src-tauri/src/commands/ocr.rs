use crate::db::DbState;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    pub text: String,
    pub confidence: f32,
    pub language: String,
}

#[cfg(target_os = "macos")]
mod vision {
    use super::OcrResult;
    use objc2::runtime::AnyObject;
    use objc2::AnyThread;
    use objc2_foundation::{NSArray, NSDictionary, NSObjectProtocol, NSString, NSURL};
    use objc2_vision::{
        VNImageRequestHandler, VNRecognizeTextRequest, VNRequest, VNRequestTextRecognitionLevel,
    };
    use std::path::Path;

    pub fn recognize_text(path: &Path) -> Result<OcrResult, String> {
        let url_string = path
            .to_str()
            .ok_or_else(|| "OCR path is not valid UTF-8".to_string())?;
        let ns_url =
            NSURL::initFileURLWithPath(NSURL::alloc(), &NSString::from_str(url_string));

        let request = VNRecognizeTextRequest::new();
        request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
        request.setUsesLanguageCorrection(true);
        if request.respondsToSelector(objc2::sel!(setAutomaticallyDetectsLanguage:)) {
            request.setAutomaticallyDetectsLanguage(true);
        }

        let handler = unsafe {
            VNImageRequestHandler::initWithURL_options(
                VNImageRequestHandler::alloc(),
                &ns_url,
                &NSDictionary::<NSString, AnyObject>::new(),
            )
        };

        let requests = NSArray::<VNRequest>::from_retained_slice(&[objc2::rc::Retained::into_super(
            objc2::rc::Retained::into_super(request.clone()),
        )]);

        handler
            .performRequests_error(&requests)
            .map_err(|err| format!("Vision OCR failed: {err}"))?;

        let Some(results) = request.results() else {
            return Ok(OcrResult {
                text: String::new(),
                confidence: 0.0,
                language: "auto".to_string(),
            });
        };

        let mut lines: Vec<String> = Vec::new();
        let mut confidences: Vec<f32> = Vec::new();
        for observation in results.iter() {
            let candidates = observation.topCandidates(1);
            let Some(candidate) = candidates.firstObject() else {
                continue;
            };
            let text = candidate.string().to_string();
            if text.trim().is_empty() {
                continue;
            }
            confidences.push(candidate.confidence());
            lines.push(text);
        }

        let text = lines.join("\n").trim().to_string();
        let confidence = if confidences.is_empty() {
            0.0
        } else {
            confidences.iter().sum::<f32>() / confidences.len() as f32
        };

        Ok(OcrResult {
            text,
            confidence,
            language: "auto".to_string(),
        })
    }
}

fn tesseract_ocr(image_path: &str) -> Option<OcrResult> {
    let output = std::process::Command::new("tesseract")
        .arg(image_path)
        .arg("stdout")
        .arg("-l")
        .arg("eng+slk")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return None;
    }
    Some(OcrResult {
        text,
        confidence: 0.85,
        language: "auto".to_string(),
    })
}

#[tauri::command]
pub fn extract_image_ocr(image_path: String) -> Result<OcrResult, String> {
    let path = Path::new(&image_path);
    if !path.exists() {
        return Err(format!("Image file does not exist: {}", image_path));
    }

    #[cfg(target_os = "macos")]
    {
        match vision::recognize_text(path) {
            Ok(result) if !result.text.trim().is_empty() => return Ok(result),
            Ok(_) => {}
            Err(error) => log::warn!("Vision OCR unavailable: {error}"),
        }
    }

    if let Some(result) = tesseract_ocr(&image_path) {
        return Ok(result);
    }

    // Never invent OCR text — empty is honest when engines fail.
    Ok(OcrResult {
        text: String::new(),
        confidence: 0.0,
        language: "auto".to_string(),
    })
}

/// OCR from an in-memory PNG/JPEG (e.g. paint pad export) without a document asset path.
#[tauri::command]
pub fn extract_image_ocr_base64(image_base64: String, mime_hint: Option<String>) -> Result<OcrResult, String> {
    use base64::Engine;
    let cleaned = image_base64
        .trim()
        .strip_prefix("data:image/png;base64,")
        .or_else(|| image_base64.trim().strip_prefix("data:image/jpeg;base64,"))
        .unwrap_or(image_base64.trim());
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(cleaned)
        .map_err(|error| format!("Invalid image base64: {error}"))?;
    if bytes.is_empty() {
        return Err("Empty image payload".to_string());
    }
    let ext = match mime_hint
        .as_deref()
        .unwrap_or("image/png")
        .to_ascii_lowercase()
        .as_str()
    {
        "image/jpeg" | "image/jpg" => "jpg",
        _ => "png",
    };
    let dir = std::env::temp_dir().join("scribe-ocr");
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = dir.join(format!("{}.{}", Uuid::new_v4(), ext));
    std::fs::write(&path, &bytes).map_err(|error| error.to_string())?;
    let result = extract_image_ocr(path.to_string_lossy().to_string());
    let _ = std::fs::remove_file(&path);
    result
}

#[tauri::command]
pub fn save_document_ocr(
    state: State<'_, DbState>,
    document_id: String,
    image_path: String,
    text: String,
) -> Result<(), String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO document_ocr (id, document_id, image_path, ocr_text, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            Uuid::new_v4().to_string(),
            document_id,
            image_path,
            trimmed,
            chrono::Utc::now().timestamp()
        ],
    )
    .map_err(|e| e.to_string())?;
    let (title, content_json): (String, String) = conn
        .query_row(
            "SELECT title, content_json FROM documents WHERE id = ?1",
            rusqlite::params![document_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    crate::db::sync_document_fts(&conn, &document_id, &title, &content_json)?;
    Ok(())
}
