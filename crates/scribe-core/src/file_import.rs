//! Path/bytes → TipTap for MCP and shared importers (byte formats only).
//!
//! Apple package formats (Pages / Numbers / Keynote) stay in the Tauri path — they need
//! macOS apps or text extractors that are not available in headless MCP.

use std::fs;
use std::path::{Path, PathBuf};

use crate::{
    csv_bytes_to_tiptap, docx_bytes_to_tiptap, epub_bytes_to_tiptap, html_bytes_to_tiptap,
    is_markup_extension, is_source_extension, is_xml_document_extension, markdown_to_tiptap,
    markup_bytes_to_tiptap, ods_bytes_to_tiptap, odt_bytes_to_tiptap, opml_bytes_to_tiptap,
    pdf_bytes_to_tiptap, pptx_bytes_to_tiptap, rtf_bytes_to_tiptap, source_path_to_tiptap,
    xml_bytes_to_tiptap, xlsx_bytes_to_tiptap,
};
use crate::rich_import::json_bytes_to_tiptap;

const MAX_IMPORT_BYTES: usize = 12 * 1024 * 1024;

/// Soft caps when walking a folder for bulk import.
pub const DEFAULT_FOLDER_IMPORT_MAX_FILES: usize = 500;
pub const DEFAULT_FOLDER_IMPORT_MAX_DEPTH: u32 = 12;

#[derive(Debug, Clone)]
pub struct CollectImportFilesOpts {
    pub max_files: usize,
    pub max_depth: u32,
    /// Include Pages / Numbers / Keynote packages (Tauri can import them; MCP cannot).
    pub include_apple_packages: bool,
    /// Skip common junk / VCS / dependency trees.
    pub skip_noise_dirs: bool,
}

impl Default for CollectImportFilesOpts {
    fn default() -> Self {
        Self {
            max_files: DEFAULT_FOLDER_IMPORT_MAX_FILES,
            max_depth: DEFAULT_FOLDER_IMPORT_MAX_DEPTH,
            include_apple_packages: false,
            skip_noise_dirs: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportKind {
    Scribe,
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
    /// Needs macOS Pages / Numbers / Keynote — not supported in headless MCP.
    ApplePackage,
}

/// Title stem from a path (`Notes.md` → `Notes`).
pub fn import_title_from_path(path: &Path, fallback: &str) -> String {
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

pub fn detect_import_kind(path: &Path) -> Result<ImportKind, String> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if file_name.ends_with(".scribe.json") {
        return Ok(ImportKind::Scribe);
    }
    if file_name.ends_with(".pages")
        || file_name.ends_with(".numbers")
        || file_name.ends_with(".key")
    {
        return Ok(ImportKind::ApplePackage);
    }

    if file_name == "dockerfile"
        || file_name.starts_with("dockerfile.")
        || file_name == "makefile"
        || file_name == "gnumakefile"
        || file_name == "cmakelists.txt"
    {
        return Ok(ImportKind::SourceCode);
    }

    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match extension.as_str() {
        "scribe" => Ok(ImportKind::Scribe),
        "pages" | "numbers" | "key" => Ok(ImportKind::ApplePackage),
        "docx" => Ok(ImportKind::Docx),
        "xlsx" | "xlsm" => Ok(ImportKind::Xlsx),
        "csv" | "tsv" => Ok(ImportKind::Csv),
        "odt" => Ok(ImportKind::Odt),
        "ods" => Ok(ImportKind::Ods),
        "html" | "htm" => Ok(ImportKind::Html),
        "rtf" => Ok(ImportKind::Rtf),
        "epub" => Ok(ImportKind::Epub),
        "pptx" => Ok(ImportKind::Pptx),
        "opml" => Ok(ImportKind::Opml),
        "json" => Ok(ImportKind::Json),
        "md" | "markdown" => Ok(ImportKind::Markdown),
        "txt" | "doc" => Ok(ImportKind::Text),
        "pdf" => Ok(ImportKind::Pdf),
        ext if is_xml_document_extension(ext) => Ok(ImportKind::Xml),
        ext if is_markup_extension(ext) => Ok(ImportKind::Markup),
        ext if is_source_extension(ext) => Ok(ImportKind::SourceCode),
        _ => Err(
            "Unsupported import format. Supported: docx, odt, md, pdf, org, xml, xlsx, ods, csv, \
             epub, pptx, opml, json, html, rtf, source code (rs, ts, py, …). \
             Pages/Numbers/Keynote require the Scribe app."
                .to_string(),
        ),
    }
}

/// Convert file bytes to TipTap JSON using the path for format detection + title stem.
///
/// Returns `(title, content_json, kind)`.
pub fn bytes_to_tiptap_note(
    path: &Path,
    bytes: &[u8],
) -> Result<(String, String, ImportKind), String> {
    if bytes.len() > MAX_IMPORT_BYTES {
        return Err(format!(
            "File too large for MCP import (max {} MB)",
            MAX_IMPORT_BYTES / (1024 * 1024)
        ));
    }

    let kind = detect_import_kind(path)?;
    if kind == ImportKind::ApplePackage {
        return Err(
            "Pages/Numbers/Keynote packages are not supported via MCP. Export to PDF/DOCX/XLSX first, or import in the Scribe app."
                .into(),
        );
    }

    let title = import_title_from_path(path, "Imported document");
    let content_json = match kind {
        ImportKind::Scribe => scribe_bytes_to_tiptap(bytes)?,
        ImportKind::Text => {
            let text = decode_utf8_lossy(bytes);
            crate::plain_text::plain_text_to_tiptap(&text, None)
        }
        ImportKind::Markdown => {
            let text = decode_utf8_lossy(bytes);
            markdown_to_tiptap(&text)
        }
        ImportKind::Docx => docx_bytes_to_tiptap(bytes)?,
        ImportKind::Xlsx => xlsx_bytes_to_tiptap(bytes)?,
        ImportKind::Csv => csv_bytes_to_tiptap(bytes)?,
        ImportKind::Odt => odt_bytes_to_tiptap(bytes)?,
        ImportKind::Ods => ods_bytes_to_tiptap(bytes)?,
        ImportKind::Html => html_bytes_to_tiptap(bytes)?,
        ImportKind::Rtf => rtf_bytes_to_tiptap(bytes)?,
        ImportKind::Epub => epub_bytes_to_tiptap(bytes)?,
        ImportKind::Pptx => pptx_bytes_to_tiptap(bytes)?,
        ImportKind::Opml => opml_bytes_to_tiptap(bytes)?,
        ImportKind::Json => json_bytes_to_tiptap(bytes)?,
        ImportKind::SourceCode => {
            let path_str = path.to_string_lossy();
            source_path_to_tiptap(&path_str, bytes)?
                .ok_or_else(|| "Unsupported source format".to_string())?
        }
        ImportKind::Markup => {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("org");
            markup_bytes_to_tiptap(ext, bytes)?
        }
        ImportKind::Xml => xml_bytes_to_tiptap(bytes)?,
        ImportKind::Pdf => pdf_bytes_to_tiptap(bytes)?,
        ImportKind::ApplePackage => unreachable!(),
    };

    Ok((title, content_json, kind))
}

fn scribe_bytes_to_tiptap(bytes: &[u8]) -> Result<String, String> {
    let text = decode_utf8_lossy(bytes);
    // Prefer disk document shape `{ title, content_json|contentJson, … }`.
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(cj) = value
            .get("content_json")
            .or_else(|| value.get("contentJson"))
            .and_then(|v| v.as_str())
        {
            return Ok(cj.to_string());
        }
        if value.get("type").and_then(|t| t.as_str()) == Some("doc") {
            return Ok(serde_json::to_string(&value).unwrap_or_else(|_| {
                r#"{"type":"doc","content":[{"type":"paragraph"}]}"#.to_string()
            }));
        }
    }
    json_bytes_to_tiptap(bytes)
}

fn decode_utf8_lossy(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

fn is_noise_dir_name(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | ".svn"
            | ".hg"
            | ".DS_Store"
            | "node_modules"
            | "target"
            | "dist"
            | "build"
            | ".trash"
            | "__pycache__"
            | ".venv"
            | "venv"
            | ".idea"
            | ".vscode"
    )
}

fn is_noise_file_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == ".ds_store"
        || lower == "thumbs.db"
        || lower == "desktop.ini"
        || lower.ends_with(".tmp")
        || lower.ends_with(".swp")
}

/// Recursively collect importable file paths under `root` (files only; Apple packages as files/dirs by name).
pub fn collect_importable_files(
    root: &Path,
    opts: CollectImportFilesOpts,
) -> Result<Vec<PathBuf>, String> {
    if !root.exists() {
        return Err(format!("Path not found: {}", root.display()));
    }
    let mut out = Vec::new();
    if root.is_file() {
        if detect_import_kind(root).is_ok() {
            let kind = detect_import_kind(root)?;
            if opts.include_apple_packages || kind != ImportKind::ApplePackage {
                out.push(root.to_path_buf());
            }
        }
        return Ok(out);
    }
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", root.display()));
    }
    walk_collect(root, root, 0, &opts, &mut out)?;
    out.sort();
    Ok(out)
}

fn walk_collect(
    root: &Path,
    dir: &Path,
    depth: u32,
    opts: &CollectImportFilesOpts,
    out: &mut Vec<PathBuf>,
) -> Result<(), String> {
    if out.len() >= opts.max_files || depth > opts.max_depth {
        return Ok(());
    }
    let entries = fs::read_dir(dir).map_err(|e| format!("Cannot read {}: {e}", dir.display()))?;
    let mut entries: Vec<_> = entries
        .filter_map(|entry| entry.ok())
        .collect();
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        if out.len() >= opts.max_files {
            break;
        }
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') && opts.skip_noise_dirs {
            // Allow extensionless hidden only when not a noise dir; skip .git etc.
            if path.is_dir() || is_noise_file_name(&name) {
                continue;
            }
        }
        if path.is_dir() {
            if opts.skip_noise_dirs && is_noise_dir_name(&name) {
                continue;
            }
            // Apple packages are directories ending in .pages / .numbers / .key
            if detect_import_kind(&path).ok() == Some(ImportKind::ApplePackage) {
                if opts.include_apple_packages {
                    out.push(path);
                }
                continue;
            }
            walk_collect(root, &path, depth + 1, opts, out)?;
            continue;
        }
        if !path.is_file() {
            continue;
        }
        if opts.skip_noise_dirs && is_noise_file_name(&name) {
            continue;
        }
        match detect_import_kind(&path) {
            Ok(ImportKind::ApplePackage) if !opts.include_apple_packages => {}
            Ok(_) => out.push(path),
            Err(_) => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_common_kinds() {
        assert_eq!(
            detect_import_kind(Path::new("/tmp/a.md")).unwrap(),
            ImportKind::Markdown
        );
        assert_eq!(
            detect_import_kind(Path::new("/tmp/a.docx")).unwrap(),
            ImportKind::Docx
        );
        assert_eq!(
            detect_import_kind(Path::new("/tmp/a.pages")).unwrap(),
            ImportKind::ApplePackage
        );
        assert_eq!(
            detect_import_kind(Path::new("/tmp/main.rs")).unwrap(),
            ImportKind::SourceCode
        );
    }

    #[test]
    fn markdown_bytes_to_note() {
        let (title, json, kind) =
            bytes_to_tiptap_note(Path::new("/docs/Hello.md"), b"# Hi\n\nWorld").unwrap();
        assert_eq!(title, "Hello");
        assert_eq!(kind, ImportKind::Markdown);
        assert!(json.contains("doc"));
        assert!(json.contains("Hi") || json.contains("World"));
    }

    #[test]
    fn apple_package_rejected() {
        let err = bytes_to_tiptap_note(Path::new("/x/Doc.pages"), b"x").unwrap_err();
        assert!(err.to_lowercase().contains("pages"));
    }

    #[test]
    fn collect_folder_finds_markdown() {
        let dir = std::env::temp_dir().join(format!(
            "scribe-import-folder-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("nested")).unwrap();
        fs::write(dir.join("a.md"), b"# A").unwrap();
        fs::write(dir.join("nested/b.md"), b"# B").unwrap();
        fs::write(dir.join("skip.png"), b"x").unwrap();
        fs::create_dir_all(dir.join("node_modules")).unwrap();
        fs::write(dir.join("node_modules/x.md"), b"# no").unwrap();

        let files = collect_importable_files(&dir, CollectImportFilesOpts::default()).unwrap();
        let names: Vec<_> = files
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert!(names.contains(&"a.md".into()));
        assert!(names.contains(&"b.md".into()));
        assert!(!names.iter().any(|n| n == "x.md"));
        let _ = fs::remove_dir_all(&dir);
    }
}
