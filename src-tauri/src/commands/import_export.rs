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
pub async fn pick_and_import_file(
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Option<Document>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Importovať dokument")
        .add_filter("Podporované formáty", &["scribe", "pages"])
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
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let now = chrono::Utc::now().timestamp();

    let (id, title, content_json, created_at) = match extension.as_str() {
        "scribe" => {
            let disk = storage::read_scribe_file(path)?;
            (
                disk.id,
                disk.title,
                disk.content_json,
                disk.created_at,
            )
        }
        "pages" => {
            let text = export::extract_pages_text(path)?;
            let title = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Import z Pages")
                .to_string();
            (
                Uuid::new_v4().to_string(),
                title,
                export::text_to_tiptap_json(&text),
                now,
            )
        }
        _ => return Err("Podporované formáty: .scribe, .pages".to_string()),
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
    {
        return Err("Podporované exporty: pdf, docx, txt, pages".to_string());
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
        _ => unreachable!(),
    }

    Ok(Some(ExportResult {
        path: output.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
pub fn scan_scribe_files(
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Vec<Document>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let dir = storage::get_documents_dir(&app, &conn)?;
    drop(conn);

    let mut imported = Vec::new();

    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("scribe") {
            continue;
        }

        let Ok(disk) = storage::read_scribe_file(&path) else {
            continue;
        };

        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let exists: Option<String> = conn
            .query_row(
                "SELECT id FROM documents WHERE id = ?1",
                params![disk.id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        if exists.is_none() {
            conn.execute(
                "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6)",
                rusqlite::params![
                    disk.id,
                    disk.title,
                    disk.content_json,
                    path.to_string_lossy().to_string(),
                    disk.created_at,
                    disk.updated_at
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        let doc = conn
            .query_row(
                &format!("{DOCUMENT_SELECT} WHERE id = ?1"),
                params![disk.id],
                map_document,
            )
            .map_err(|e| e.to_string())?;

        imported.push(doc);
    }

    Ok(imported)
}

#[tauri::command]
pub fn force_save_document(
    app: AppHandle,
    state: State<'_, DbState>,
    id: String,
) -> Result<Document, String> {
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
