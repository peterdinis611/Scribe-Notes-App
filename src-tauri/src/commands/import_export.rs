use crate::commands::storage::persist_document;
use crate::db::DbState;
use crate::export;
use crate::storage;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use super::documents::{Document, map_document, DOCUMENT_SELECT};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportHtmlInput {
    pub html: String,
    pub plain_text: String,
    pub title: String,
    pub format: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Nepodarilo sa prečítať súbor: {e}"))
}

#[tauri::command]
pub fn pick_and_import_file(
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Option<Document>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Importovať dokument")
        .add_filter(
            "Podporované dokumenty",
            &["scribe", "pages", "md", "markdown", "txt", "docx", "rtf", "doc"],
        )
        .blocking_pick_file();

    let Some(path) = picked else {
        return Ok(None);
    };

    let path = PathBuf::from(path.to_string());
    let doc = import_file_at_path(&app, &state, &path)?;
    Ok(Some(doc))
}

#[tauri::command]
pub fn import_file(
    app: AppHandle,
    state: State<'_, DbState>,
    path: String,
) -> Result<Document, String> {
    import_file_at_path(&app, &state, Path::new(&path))
}

fn import_file_at_path(
    app: &AppHandle,
    state: &State<'_, DbState>,
    path: &Path,
) -> Result<Document, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp();

    let (id, title, content_json, created_at) = match detect_import_format(path)? {
        ImportFormat::Scribe => {
            let disk = storage::read_scribe_file(path)?;
            let created_at = if disk.created_at > 0 {
                disk.created_at
            } else {
                now
            };
            (
                disk.id,
                disk.title,
                disk.content_json,
                created_at,
            )
        }
        ImportFormat::Pages => {
            let text = export::extract_pages_text(path)?;
            let title = import_title_from_path(path, "Import z Pages");
            (
                Uuid::new_v4().to_string(),
                title,
                export::text_to_tiptap_json(&text),
                now,
            )
        }
        ImportFormat::Text => {
            let text = export::import_text_from_file(path)?;
            let title = import_title_from_path(path, "Importovaný dokument");
            (
                Uuid::new_v4().to_string(),
                title,
                export::text_to_tiptap_json(&text),
                now,
            )
        }
    };

    let existing: Option<String> = conn
        .query_row("SELECT id FROM documents WHERE id = ?1", params![id], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|e| e.to_string())?;

    if existing.is_some() {
        conn.execute(
            "UPDATE documents SET title = ?1, content_json = ?2, updated_at = ?3 WHERE id = ?4",
            params![title, content_json, now, id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, NULL, ?4, ?5)",
            params![id, title, content_json, created_at, now],
        )
        .map_err(|e| e.to_string())?;
    }

    let file_path = persist_document(app, &conn, &id, &title, &content_json, created_at, now)?;

    crate::db::sync_document_fts(&conn, &id, &title, &content_json)?;

    Ok(Document {
        id,
        title,
        content_json,
        folder_id: None,
        file_path: Some(file_path),
        created_at,
        updated_at: now,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ImportFormat {
    Scribe,
    Pages,
    Text,
}

fn import_title_from_path(path: &Path, fallback: &str) -> String {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(fallback);

    let without_ext = if file_name.to_ascii_lowercase().ends_with(".scribe.json") {
        file_name.trim_end_matches(".scribe.json")
    } else {
        path.file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or(file_name)
    };

    let trimmed = without_ext.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn detect_import_format(path: &Path) -> Result<ImportFormat, String> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if file_name.ends_with(".scribe.json") {
        return Ok(ImportFormat::Scribe);
    }

    if file_name.ends_with(".pages") {
        return Ok(ImportFormat::Pages);
    }

    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match extension.as_str() {
        "scribe" => Ok(ImportFormat::Scribe),
        "pages" => Ok(ImportFormat::Pages),
        "md" | "markdown" | "txt" | "docx" | "doc" | "rtf" => Ok(ImportFormat::Text),
        _ => Err(
            "Podporované formáty: .scribe, .pages, .md, .txt, .docx, .rtf".to_string(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_import_format_supports_common_extensions() {
        assert_eq!(
            detect_import_format(Path::new("/tmp/note.scribe")).unwrap(),
            ImportFormat::Scribe
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/legacy.scribe.json")).unwrap(),
            ImportFormat::Scribe
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/report.pages")).unwrap(),
            ImportFormat::Pages
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/My Doc.pages/")).unwrap(),
            ImportFormat::Pages
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/readme.md")).unwrap(),
            ImportFormat::Text
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/notes.docx")).unwrap(),
            ImportFormat::Text
        );
        assert!(detect_import_format(Path::new("/tmp/image.png")).is_err());
    }

    #[test]
    fn import_title_from_path_strips_extension() {
        assert_eq!(
            import_title_from_path(Path::new("/tmp/Môj dokument.docx"), "fallback"),
            "Môj dokument"
        );
        assert_eq!(
            import_title_from_path(Path::new("/tmp/legacy.scribe.json"), "fallback"),
            "legacy"
        );
    }
}

#[tauri::command]
pub async fn export_document(
    app: AppHandle,
    state: State<'_, DbState>,
    input: ExportHtmlInput,
) -> Result<Option<ExportResult>, String> {
    let format = input.format.to_lowercase();
    if format != "pdf"
        && format != "docx"
        && format != "txt"
        && format != "pages"
        && format != "md"
        && format != "markdown"
    {
        return Err("Podporované exporty: pdf, docx, txt, pages, md".to_string());
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let dir = storage::get_documents_dir(&app, &conn)?;
    drop(conn);

    let default_path = export::default_export_path(&dir, &input.title, &format);

    let picked = app
        .dialog()
        .file()
        .set_title(format!("Exportovať ako {}", format.to_uppercase()))
        .set_file_name(default_path.file_name().unwrap().to_string_lossy().as_ref())
        .blocking_save_file();

    let Some(path) = picked else {
        return Ok(None);
    };

    let output = PathBuf::from(path.to_string());

    match format.as_str() {
        "pdf" => export::export_html_to_pdf(&input.html, &output)?,
        "docx" => export::export_html_to_docx(&input.html, &output)?,
        "txt" => export::export_plain_text(&input.plain_text, &output)?,
        "pages" => export::export_text_to_pages(&input.plain_text, &output)?,
        "md" | "markdown" => export::export_markdown(&input.plain_text, &output)?,
        _ => unreachable!(),
    }

    Ok(Some(ExportResult {
        path: output.to_string_lossy().to_string(),
    }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPreviewResult {
    pub data_base64: String,
}

#[tauri::command]
pub fn preview_pdf_export(input: ExportHtmlInput) -> Result<PdfPreviewResult, String> {
    let temp_dir = std::env::temp_dir().join(format!("scribe-pdf-preview-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let output = temp_dir.join("preview.pdf");
    export::export_html_to_pdf(&input.html, &output)?;
    let bytes = std::fs::read(&output).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&temp_dir);
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    Ok(PdfPreviewResult {
        data_base64: STANDARD.encode(bytes),
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanScribeResult {
    pub scanned_count: u32,
    pub imported_count: u32,
    pub updated_count: u32,
}

#[tauri::command]
pub fn scan_scribe_files(
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<ScanScribeResult, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let dir = storage::get_documents_dir(&app, &conn)?;
    drop(conn);

    let mut paths = Vec::new();
    storage::collect_scribe_files(&dir, &mut paths)?;

    let mut scanned_count = 0u32;
    let mut imported_count = 0u32;
    let mut updated_count = 0u32;

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("BEGIN IMMEDIATE", [])
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        for path in paths {
            scanned_count += 1;

            let Ok(disk) = storage::read_scribe_file(&path) else {
                continue;
            };

            let path_str = path.to_string_lossy().to_string();
            let existing: Option<(String, i64)> = conn
                .query_row(
                    "SELECT id, updated_at FROM documents WHERE id = ?1",
                    params![disk.id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;

            match existing {
                None => {
                    conn.execute(
                        "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6)",
                        rusqlite::params![
                            disk.id,
                            disk.title,
                            disk.content_json,
                            path_str,
                            disk.created_at,
                            disk.updated_at
                        ],
                    )
                    .map_err(|e| e.to_string())?;
                    crate::db::sync_document_fts(&conn, &disk.id, &disk.title, &disk.content_json)?;
                    imported_count += 1;
                }
                Some((_, db_updated_at)) if disk.updated_at > db_updated_at => {
                    conn.execute(
                        "UPDATE documents SET title = ?1, content_json = ?2, updated_at = ?3, file_path = ?4 WHERE id = ?5",
                        params![
                            disk.title,
                            disk.content_json,
                            disk.updated_at,
                            path_str,
                            disk.id
                        ],
                    )
                    .map_err(|e| e.to_string())?;
                    crate::db::sync_document_fts(&conn, &disk.id, &disk.title, &disk.content_json)?;
                    updated_count += 1;
                }
                Some((_, _)) => {
                    conn.execute(
                        "UPDATE documents SET file_path = ?1 WHERE id = ?2 AND (file_path IS NULL OR file_path = '')",
                        params![path_str, disk.id],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }

        Ok(())
    })();

    if result.is_err() {
        let _ = conn.execute("ROLLBACK", []);
        return Err(result.err().unwrap());
    }

    conn.execute("COMMIT", [])
        .map_err(|e| e.to_string())?;

    Ok(ScanScribeResult {
        scanned_count,
        imported_count,
        updated_count,
    })
}

#[tauri::command]
pub fn force_save_document(
    app: AppHandle,
    state: State<'_, DbState>,
    id: String,
) -> Result<Document, String> {
    let _ = crate::commands::storage::flush_document_persist(&state.persist_queue, Some(&id));

    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let doc = conn
        .query_row(
            &format!("{DOCUMENT_SELECT} WHERE id = ?1"),
            params![id],
            map_document,
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Document not found: {id}"))?;

    let file_path = persist_document(
        &app,
        &conn,
        &doc.id,
        &doc.title,
        &doc.content_json,
        doc.created_at,
        doc.updated_at,
    )?;

    Ok(Document {
        file_path: Some(file_path),
        ..doc
    })
}
