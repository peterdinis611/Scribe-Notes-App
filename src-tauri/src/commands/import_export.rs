use crate::commands::storage::persist_document;
use crate::db::DbState;
use crate::export;
use crate::security::PathAccessGate;
use crate::storage;
use rusqlite::{params, OptionalExtension};
use scribe_core::file_antivirus::{self, AntivirusPolicy};
use scribe_core::storage_fs;
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

/// Native open dialog; grants the picked path. Rejects arbitrary JS path strings.
#[tauri::command]
pub fn pick_and_grant_path(
    app: AppHandle,
    gate: State<'_, PathAccessGate>,
    title: Option<String>,
    directory: Option<bool>,
) -> Result<Option<String>, String> {
    let mut dialog = app.dialog().file();
    if let Some(title) = title.as_deref() {
        dialog = dialog.set_title(title);
    }
    let picked = if directory.unwrap_or(false) {
        dialog.blocking_pick_folder().map(|p| PathBuf::from(p.to_string()))
    } else {
        dialog.blocking_pick_file().map(|p| PathBuf::from(p.to_string()))
    };
    let Some(path) = picked else {
        return Ok(None);
    };
    gate.grant_from_picker(&path);
    crate::security::log_security(
        &app,
        "path_grant",
        "Granted path from native picker",
        Some(serde_json::json!({ "kind": "open" })),
        "ok",
    );
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Native save dialog; grants the chosen path (and parent) for a subsequent write.
#[tauri::command]
pub fn pick_and_grant_save_path(
    app: AppHandle,
    gate: State<'_, PathAccessGate>,
    title: Option<String>,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    let mut dialog = app.dialog().file();
    if let Some(title) = title.as_deref() {
        dialog = dialog.set_title(title);
    }
    if let Some(default_path) = default_path.as_deref() {
        dialog = dialog.set_file_name(default_path);
    }
    let Some(path) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = PathBuf::from(path.to_string());
    gate.grant_from_picker(&path);
    crate::security::log_security(
        &app,
        "path_grant",
        "Granted path from native save dialog",
        Some(serde_json::json!({ "kind": "save" })),
        "ok",
    );
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Grant paths from a native window drag-and-drop (Rust-side event). Not for arbitrary JS strings.
#[tauri::command]
pub fn grant_dropped_paths(
    gate: State<'_, PathAccessGate>,
    paths: Vec<String>,
) -> Result<(), String> {
    if paths.len() > 64 {
        return Err("Príliš veľa súborov naraz.".into());
    }
    for path in paths {
        let path = PathBuf::from(path);
        if !path.exists() {
            continue;
        }
        gate.grant_from_picker(&path);
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadTextFileResult {
    pub text: String,
    pub encoding: String,
    pub converted: bool,
}

#[tauri::command]
pub fn read_text_file(
    app: AppHandle,
    state: State<'_, DbState>,
    gate: State<'_, PathAccessGate>,
    path: String,
) -> Result<ReadTextFileResult, String> {
    let path = PathBuf::from(path);
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let validated = gate.validate_read(&app, &conn, &path)?;
    drop(conn);
    let decoded = export::read_text_file_decoded(&validated)?;
    Ok(ReadTextFileResult {
        text: decoded.text,
        encoding: decoded.encoding,
        converted: decoded.converted,
    })
}

#[tauri::command]
pub fn read_binary_file(
    app: AppHandle,
    state: State<'_, DbState>,
    gate: State<'_, PathAccessGate>,
    path: String,
) -> Result<Vec<u8>, String> {
    let path = PathBuf::from(path);
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let validated = gate.validate_read(&app, &conn, &path)?;
    drop(conn);
    std::fs::read(&validated).map_err(|e| format!("Nepodarilo sa prečítať súbor: {e}"))
}

#[tauri::command]
pub fn write_text_file(
    app: AppHandle,
    state: State<'_, DbState>,
    gate: State<'_, PathAccessGate>,
    path: String,
    contents: String,
) -> Result<(), String> {
    let path = PathBuf::from(path);
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let validated = gate.validate_read(&app, &conn, &path)?;
    drop(conn);
    if let Some(parent) = validated.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Nepodarilo sa vytvoriť priečinok: {e}"))?;
    }
    std::fs::write(&validated, contents)
        .map_err(|e| format!("Nepodarilo sa zapísať súbor: {e}"))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickAndImportResult {
    pub imported: Vec<Document>,
    pub failed: Vec<PickAndImportFailure>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickAndImportFailure {
    pub path: String,
    pub error: String,
}

/// Multi-file picker + import. Returns `None` when the user cancels.
#[tauri::command]
pub fn pick_and_import_file(
    app: AppHandle,
    state: State<'_, DbState>,
    gate: State<'_, PathAccessGate>,
    antivirus_policy: Option<AntivirusPolicy>,
) -> Result<Option<PickAndImportResult>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Importovať dokumenty")
        .add_filter(
            "Podporované dokumenty",
            &[
                "scribe",
                "pages",
                "numbers",
                "key",
                "md",
                "markdown",
                "txt",
                "docx",
                "rtf",
                "doc",
                "xlsx",
                "xlsm",
                "csv",
                "tsv",
                "xls",
                "odt",
                "ods",
                "html",
                "htm",
                "epub",
                "pptx",
                "opml",
                "json",
                "jsonc",
                "jsonl",
                "rs",
                "py",
                "ts",
                "tsx",
                "js",
                "jsx",
                "go",
                "java",
                "kt",
                "swift",
                "c",
                "h",
                "cpp",
                "cc",
                "cs",
                "rb",
                "php",
                "lua",
                "r",
                "sql",
                "toml",
                "yaml",
                "yml",
                "xml",
                "xsd",
                "xsl",
                "xslt",
                "rss",
                "atom",
                "plist",
                "css",
                "scss",
                "sh",
                "bash",
                "zsh",
                "ps1",
                "dockerfile",
                "makefile",
                "graphql",
                "proto",
                "vue",
                "svelte",
                "dart",
                "scala",
                "ex",
                "exs",
                "hs",
                "clj",
                "zig",
                "nim",
                "nix",
                "tf",
                "sol",
                "diff",
                "patch",
                "pdf",
                "org",
                "rst",
                "adoc",
                "asciidoc",
                "fountain",
                "wiki",
                "mediawiki",
                "ics",
                "ical",
                "eml",
            ],
        )
        .blocking_pick_files();

    let Some(paths) = picked else {
        return Ok(None);
    };
    if paths.is_empty() {
        return Ok(None);
    }

    let mut imported = Vec::new();
    let mut failed = Vec::new();
    for path in paths {
        let path = PathBuf::from(path.to_string());
        gate.grant_from_picker(&path);
        match import_file_at_path(&app, &state, &gate, &path, antivirus_policy.as_ref()) {
            Ok(doc) => imported.push(doc),
            Err(error) => failed.push(PickAndImportFailure {
                path: path.to_string_lossy().to_string(),
                error,
            }),
        }
    }

    Ok(Some(PickAndImportResult { imported, failed }))
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PagesImportPrepared {
    Docx { path: String },
    Html { html: String },
    Text { text: String },
}

#[tauri::command]
pub fn prepare_pages_import(
    app: AppHandle,
    state: State<'_, DbState>,
    gate: State<'_, PathAccessGate>,
    path: String,
) -> Result<PagesImportPrepared, String> {
    let path = PathBuf::from(path);
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    gate.validate_read(&app, &conn, &path)?;
    drop(conn);

    if export::pages_app_installed() {
        if let Ok(docx_path) = export::export_pages_to_docx(&path) {
            return Ok(PagesImportPrepared::Docx {
                path: docx_path.to_string_lossy().to_string(),
            });
        }
    }

    if let Ok(html) = export::extract_pages_html(&path) {
        if !html.trim().is_empty() {
            return Ok(PagesImportPrepared::Html { html });
        }
    }

    let text = export::extract_pages_text(&path)?;
    Ok(PagesImportPrepared::Text { text })
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum NumbersImportPrepared {
    Xlsx { path: String },
    Text { text: String },
}

#[tauri::command]
pub fn prepare_numbers_import(
    app: AppHandle,
    state: State<'_, DbState>,
    gate: State<'_, PathAccessGate>,
    path: String,
) -> Result<NumbersImportPrepared, String> {
    let path = PathBuf::from(path);
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    gate.validate_read(&app, &conn, &path)?;
    drop(conn);

    if export::numbers_app_installed() {
        if let Ok(xlsx_path) = export::export_numbers_to_xlsx(&path) {
            return Ok(NumbersImportPrepared::Xlsx {
                path: xlsx_path.to_string_lossy().to_string(),
            });
        }
    }

    let text = export::extract_numbers_text(&path)?;
    Ok(NumbersImportPrepared::Text { text })
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum KeynoteImportPrepared {
    Pptx { path: String },
    Text { text: String },
}

#[tauri::command]
pub fn prepare_keynote_import(
    app: AppHandle,
    state: State<'_, DbState>,
    gate: State<'_, PathAccessGate>,
    path: String,
) -> Result<KeynoteImportPrepared, String> {
    let path = PathBuf::from(path);
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    gate.validate_read(&app, &conn, &path)?;
    drop(conn);

    if export::keynote_app_installed() {
        if let Ok(pptx_path) = export::export_keynote_to_pptx(&path) {
            return Ok(KeynoteImportPrepared::Pptx {
                path: pptx_path.to_string_lossy().to_string(),
            });
        }
    }

    let text = export::extract_keynote_text(&path)?;
    Ok(KeynoteImportPrepared::Text { text })
}

#[tauri::command]
pub fn cleanup_temp_import_file(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    let validated = PathAccessGate::validate_temp_file(&path)?;

    if validated.is_file() {
        std::fs::remove_file(validated).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn import_file(
    app: AppHandle,
    state: State<'_, DbState>,
    gate: State<'_, PathAccessGate>,
    path: String,
    antivirus_policy: Option<AntivirusPolicy>,
) -> Result<Document, String> {
    let path = Path::new(&path);
    import_file_at_path(&app, &state, &gate, path, antivirus_policy.as_ref())
}

fn import_file_at_path(
    app: &AppHandle,
    state: &State<'_, DbState>,
    gate: &State<'_, PathAccessGate>,
    path: &Path,
    antivirus_policy: Option<&AntivirusPolicy>,
) -> Result<Document, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let validated = gate.validate_read(app, &conn, path)?;
    let docs = storage::get_documents_dir(app, &conn)?;
    drop(conn);

    // Always enforce policy in Rust. `None` uses secure defaults (scan on import) so
    // a forgotten FE argument cannot skip the gate. Callers that already scanned
    // should pass an explicit policy with `scan_on_import: false` / `enabled: false`.
    let policy = antivirus_policy
        .cloned()
        .unwrap_or_else(AntivirusPolicy::default);
    if policy.enabled && policy.scan_on_import {
        let files_root = storage_fs::ensure_files_root(&docs).ok();
        file_antivirus::gate_import_path(&validated, &policy, files_root.as_deref())?;
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp();

    let (id, title, content_json, created_at) = match detect_import_format(&validated)? {
        ImportFormat::Scribe => {
            let disk = storage::read_scribe_file(&validated)?;
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
            let text = export::extract_pages_text(&validated)?;
            let title = import_title_from_path(&validated, "Import z Pages");
            (
                Uuid::new_v4().to_string(),
                title,
                export::text_to_tiptap_json(&text),
                now,
            )
        }
        ImportFormat::Numbers => {
            let title = import_title_from_path(&validated, "Import z Numbers");
            let content_json = if export::numbers_app_installed() {
                match export::export_numbers_to_xlsx(&validated) {
                    Ok(xlsx_path) => {
                        let bytes = std::fs::read(&xlsx_path).map_err(|e| e.to_string())?;
                        let _ = std::fs::remove_file(&xlsx_path);
                        scribe_core::xlsx_bytes_to_tiptap(&bytes)?
                    }
                    Err(_) => {
                        export::text_to_tiptap_json(&export::extract_numbers_text(&validated)?)
                    }
                }
            } else {
                export::text_to_tiptap_json(&export::extract_numbers_text(&validated)?)
            };
            (Uuid::new_v4().to_string(), title, content_json, now)
        }
        ImportFormat::Keynote => {
            let title = import_title_from_path(&validated, "Import z Keynote");
            let content_json = if export::keynote_app_installed() {
                match export::export_keynote_to_pptx(&validated) {
                    Ok(pptx_path) => {
                        let bytes = std::fs::read(&pptx_path).map_err(|e| e.to_string())?;
                        let _ = std::fs::remove_file(&pptx_path);
                        scribe_core::pptx_bytes_to_tiptap(&bytes)?
                    }
                    Err(_) => {
                        export::text_to_tiptap_json(&export::extract_keynote_text(&validated)?)
                    }
                }
            } else {
                export::text_to_tiptap_json(&export::extract_keynote_text(&validated)?)
            };
            (Uuid::new_v4().to_string(), title, content_json, now)
        }
        ImportFormat::Text => {
            let text = export::import_text_from_file(&validated)?;
            let title = import_title_from_path(&validated, "Importovaný dokument");
            (
                Uuid::new_v4().to_string(),
                title,
                export::text_to_tiptap_json(&text),
                now,
            )
        }
        ImportFormat::Markdown => {
            let text = export::import_text_from_file(&validated)?;
            let title = import_title_from_path(&validated, "Importovaný dokument");
            (
                Uuid::new_v4().to_string(),
                title,
                scribe_core::markdown_to_tiptap(&text),
                now,
            )
        }
        ImportFormat::Docx => {
            let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;
            let title = import_title_from_path(&validated, "Importovaný dokument");
            (
                Uuid::new_v4().to_string(),
                title,
                scribe_core::docx_bytes_to_tiptap(&bytes)?,
                now,
            )
        }
        ImportFormat::Xlsx => {
            let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;
            let title = import_title_from_path(&validated, "Importovaný zošit");
            (
                Uuid::new_v4().to_string(),
                title,
                scribe_core::xlsx_bytes_to_tiptap(&bytes)?,
                now,
            )
        }
        ImportFormat::Csv => {
            let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;
            let title = import_title_from_path(&validated, "Importovaná tabuľka");
            (
                Uuid::new_v4().to_string(),
                title,
                scribe_core::csv_bytes_to_tiptap(&bytes)?,
                now,
            )
        }
        ImportFormat::Odt => {
            let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;
            let title = import_title_from_path(&validated, "Importovaný dokument");
            (
                Uuid::new_v4().to_string(),
                title,
                scribe_core::odt_bytes_to_tiptap(&bytes)?,
                now,
            )
        }
        ImportFormat::Ods => {
            let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;
            let title = import_title_from_path(&validated, "Importovaný zošit");
            (
                Uuid::new_v4().to_string(),
                title,
                scribe_core::ods_bytes_to_tiptap(&bytes)?,
                now,
            )
        }
        ImportFormat::Html => {
            let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;
            let title = import_title_from_path(&validated, "Importovaná stránka");
            (
                Uuid::new_v4().to_string(),
                title,
                scribe_core::html_bytes_to_tiptap(&bytes)?,
                now,
            )
        }
        ImportFormat::Rtf => {
            let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;
            let title = import_title_from_path(&validated, "Importovaný dokument");
            (
                Uuid::new_v4().to_string(),
                title,
                scribe_core::rtf_bytes_to_tiptap(&bytes)?,
                now,
            )
        }
        ImportFormat::Epub => {
            let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;
            let title = import_title_from_path(&validated, "Importovaná kniha");
            (
                Uuid::new_v4().to_string(),
                title,
                scribe_core::epub_bytes_to_tiptap(&bytes)?,
                now,
            )
        }
        ImportFormat::Pptx => {
            let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;
            let title = import_title_from_path(&validated, "Importovaná prezentácia");
            (
                Uuid::new_v4().to_string(),
                title,
                scribe_core::pptx_bytes_to_tiptap(&bytes)?,
                now,
            )
        }
        ImportFormat::Opml => {
            let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;
            let title = import_title_from_path(&validated, "Importovaná osnova");
            (
                Uuid::new_v4().to_string(),
                title,
                scribe_core::opml_bytes_to_tiptap(&bytes)?,
                now,
            )
        }
        ImportFormat::Json => {
            let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;
            let title = import_title_from_path(&validated, "Importovaný JSON");
            (
                Uuid::new_v4().to_string(),
                title,
                scribe_core::json_bytes_to_tiptap(&bytes)?,
                now,
            )
        }
        ImportFormat::SourceCode => {
            let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;
            let title = import_title_from_path(&validated, "Importovaný kód");
            let path_str = validated.to_string_lossy();
            let content_json = scribe_core::source_path_to_tiptap(&path_str, &bytes)?
                .ok_or_else(|| "Nepodporovaný programovací formát".to_string())?;
            (Uuid::new_v4().to_string(), title, content_json, now)
        }
        ImportFormat::Markup => {
            let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;
            let ext = validated
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("org");
            let title = import_title_from_path(&validated, "Importovaný dokument");
            (
                Uuid::new_v4().to_string(),
                title,
                scribe_core::markup_bytes_to_tiptap(ext, &bytes)?,
                now,
            )
        }
        ImportFormat::Xml => {
            let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;
            let title = import_title_from_path(&validated, "Import z XML");
            (
                Uuid::new_v4().to_string(),
                title,
                scribe_core::xml_bytes_to_tiptap(&bytes)?,
                now,
            )
        }
        ImportFormat::Pdf => {
            let bytes = std::fs::read(&validated).map_err(|e| e.to_string())?;
            let title = import_title_from_path(&validated, "Import z PDF");
            (
                Uuid::new_v4().to_string(),
                title,
                scribe_core::pdf_bytes_to_tiptap(&bytes)?,
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
        vault_verifier: None,
        tags: Vec::new(),
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ImportFormat {
    Scribe,
    Pages,
    Numbers,
    Keynote,
    Text,
    Markdown,
    Docx,
    Xlsx,
    Csv,
    Odt,
    Ods,
    Html,
    Rtf,
    Epub,
    Pptx,
    Opml,
    Json,
    SourceCode,
    Markup,
    Xml,
    Pdf,
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
    if file_name.ends_with(".numbers") {
        return Ok(ImportFormat::Numbers);
    }
    if file_name.ends_with(".key") {
        return Ok(ImportFormat::Keynote);
    }

    // Extensionless / special build files.
    if file_name == "dockerfile"
        || file_name.starts_with("dockerfile.")
        || file_name == "makefile"
        || file_name == "gnumakefile"
        || file_name == "cmakelists.txt"
    {
        return Ok(ImportFormat::SourceCode);
    }

    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match extension.as_str() {
        "scribe" => Ok(ImportFormat::Scribe),
        "pages" => Ok(ImportFormat::Pages),
        "numbers" => Ok(ImportFormat::Numbers),
        "key" => Ok(ImportFormat::Keynote),
        "docx" => Ok(ImportFormat::Docx),
        "xlsx" | "xlsm" => Ok(ImportFormat::Xlsx),
        "csv" | "tsv" => Ok(ImportFormat::Csv),
        "odt" => Ok(ImportFormat::Odt),
        "ods" => Ok(ImportFormat::Ods),
        "html" | "htm" => Ok(ImportFormat::Html),
        "rtf" => Ok(ImportFormat::Rtf),
        "epub" => Ok(ImportFormat::Epub),
        "pptx" => Ok(ImportFormat::Pptx),
        "opml" => Ok(ImportFormat::Opml),
        // Structured Scribe JSON when shape matches; otherwise code block.
        "json" => Ok(ImportFormat::Json),
        "md" | "markdown" => Ok(ImportFormat::Markdown),
        "txt" | "doc" => Ok(ImportFormat::Text),
        "pdf" => Ok(ImportFormat::Pdf),
        ext if scribe_core::is_xml_document_extension(ext) => Ok(ImportFormat::Xml),
        ext if scribe_core::is_markup_extension(ext) => Ok(ImportFormat::Markup),
        ext if scribe_core::is_source_extension(ext) => Ok(ImportFormat::SourceCode),
        _ => Err(
            "Podporované formáty: dokumenty (docx, odt, md, pdf, org, xml, …), tabuľky (xlsx, ods, csv), \
             EPUB/PPTX/OPML/JSON/ICS/EML a zdrojový kód (rs, ts, py, go, …)"
                .to_string(),
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
            detect_import_format(Path::new("/tmp/budget.numbers")).unwrap(),
            ImportFormat::Numbers
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/Talk.key")).unwrap(),
            ImportFormat::Keynote
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/readme.md")).unwrap(),
            ImportFormat::Markdown
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/notes.docx")).unwrap(),
            ImportFormat::Docx
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/budget.xlsx")).unwrap(),
            ImportFormat::Xlsx
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/people.csv")).unwrap(),
            ImportFormat::Csv
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/people.tsv")).unwrap(),
            ImportFormat::Csv
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/notes.pdf")).unwrap(),
            ImportFormat::Pdf
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/todo.org")).unwrap(),
            ImportFormat::Markup
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/calendar.ics")).unwrap(),
            ImportFormat::Markup
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/mail.eml")).unwrap(),
            ImportFormat::Markup
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/note.odt")).unwrap(),
            ImportFormat::Odt
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/sheet.ods")).unwrap(),
            ImportFormat::Ods
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/page.html")).unwrap(),
            ImportFormat::Html
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/memo.rtf")).unwrap(),
            ImportFormat::Rtf
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/book.epub")).unwrap(),
            ImportFormat::Epub
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/deck.pptx")).unwrap(),
            ImportFormat::Pptx
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/outline.opml")).unwrap(),
            ImportFormat::Opml
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/note.json")).unwrap(),
            ImportFormat::Json
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/main.rs")).unwrap(),
            ImportFormat::SourceCode
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/app.tsx")).unwrap(),
            ImportFormat::SourceCode
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/Dockerfile")).unwrap(),
            ImportFormat::SourceCode
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/config.xml")).unwrap(),
            ImportFormat::Xml
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/feed.rss")).unwrap(),
            ImportFormat::Xml
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/Info.plist")).unwrap(),
            ImportFormat::Xml
        );
        assert_eq!(
            detect_import_format(Path::new("/tmp/icon.svg")).unwrap(),
            ImportFormat::SourceCode
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
    if format != "docx"
        && format != "txt"
        && format != "pages"
        && format != "md"
        && format != "markdown"
        && format != "html"
        && format != "html-zip"
        && format != "epub"
    {
        return Err("Podporované exporty: docx, txt, pages, md, html, html-zip, epub".to_string());
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let dir = storage::get_documents_dir(&app, &conn)?;
    drop(conn);

    let ext = match format.as_str() {
        "html-zip" => "zip",
        "markdown" => "md",
        other => other,
    };
    let default_path = export::default_export_path(&dir, &input.title, ext);

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
        "docx" => export::export_html_to_docx(&input.html, &output)?,
        "txt" => export::export_plain_text(&input.plain_text, &output)?,
        "pages" => {
            if let Err(html_error) = export::export_html_to_pages(&input.html, &output) {
                // Fallback to plain text if rich HTML→Pages path fails.
                export::export_text_to_pages(&input.plain_text, &output).map_err(|text_error| {
                    format!("{html_error} | fallback: {text_error}")
                })?;
            }
        }
        "md" | "markdown" => export::export_markdown(&input.plain_text, &output)?,
        "html" => export::export_html_file(&input.html, &output)?,
        "html-zip" => export::export_html_package(&input.html, &input.title, &output)?,
        "epub" => export::export_epub(&input.html, &input.title, &output)?,
        _ => unreachable!(),
    }

    Ok(Some(ExportResult {
        path: output.to_string_lossy().to_string(),
    }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPdfBytesInput {
    pub title: String,
    pub data_base64: String,
}

#[tauri::command]
pub async fn export_pdf_bytes(
    app: AppHandle,
    state: State<'_, DbState>,
    input: ExportPdfBytesInput,
) -> Result<Option<ExportResult>, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let bytes = STANDARD
        .decode(&input.data_base64)
        .map_err(|e| format!("Neplatné PDF dáta: {e}"))?;

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let dir = storage::get_documents_dir(&app, &conn)?;
    drop(conn);

    let output = export::default_pdf_export_path(&dir, &input.title)?;
    std::fs::write(&output, bytes).map_err(|e| format!("Nepodarilo sa uložiť PDF: {e}"))?;

    Ok(Some(ExportResult {
        path: output.to_string_lossy().to_string(),
    }))
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizeClipboardHtmlInput {
    pub html: String,
}

/// Clean Word / Pages / web clipboard HTML into TipTap-friendly markup.
#[tauri::command]
pub fn normalize_clipboard_html(
    input: NormalizeClipboardHtmlInput,
) -> Result<scribe_core::HtmlPasteResult, String> {
    Ok(scribe_core::normalize_clipboard_html(&input.html))
}
