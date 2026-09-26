//! ID-based heavy pipelines that keep TipTap blobs off the JS↔Rust IPC boundary.
//! Conversion / merge / LCS live in `scribe-core`; these commands only load from SQLite
//! and write results to disk or return compact payloads.

use crate::commands::documents::{insert_document_record, Document};
use crate::commands::import_export::ExportResult;
use crate::commands::storage::queue_document_persist;
use crate::db::DbState;
use crate::export;
use crate::storage;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use scribe_core::{
    diff_lines, document_is_vault, merge_chapters, tiptap_to_html, tiptap_to_markdown,
    tiptap_to_plain_text, DiffResult,
};
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

const CURRENT_REVISION_ID: &str = "__current__";

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

fn load_document_row(
    conn: &rusqlite::Connection,
    id: &str,
) -> Result<(String, String, String), String> {
    if document_is_vault(conn, id)? {
        return Err(
            "Šifrované vault dokumenty sa exportujú/kompilujú z otvoreného editora".to_string(),
        );
    }
    conn.query_row(
        "SELECT id, title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
        params![id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .map_err(|_| format!("Document not found: {id}"))
}

fn load_revision_plain(
    conn: &rusqlite::Connection,
    document_id: &str,
    revision_id: &str,
    current_plain_text: Option<&str>,
) -> Result<String, String> {
    if document_is_vault(conn, document_id)? {
        return Err("Šifrované vault dokumenty sa nedajú porovnávať cez revision ID".to_string());
    }

    if revision_id == CURRENT_REVISION_ID {
        if let Some(text) = current_plain_text {
            return Ok(text.to_string());
        }
        let (_, _, content_json) = load_document_row(conn, document_id)?;
        return Ok(tiptap_to_plain_text(&content_json));
    }

    let (rev_document_id, content_json): (String, String) = conn
        .query_row(
            "SELECT document_id, content_json FROM document_revisions WHERE id = ?1",
            params![revision_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| format!("Revision not found: {revision_id}"))?;

    if rev_document_id != document_id {
        return Err("Revision does not belong to this document".to_string());
    }

    Ok(tiptap_to_plain_text(&content_json))
}

fn wrap_structural_html(article: &str, title: &str) -> String {
    let escaped_title = scribe_core::escape_html(title);
    format!(
        r#"<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{escaped_title}</title>
<style>
  body {{ font-family: Georgia, "Times New Roman", serif; line-height: 1.55; max-width: 42rem; margin: 2rem auto; padding: 0 1.25rem; color: #0e1210; }}
  h1, h2, h3, h4, h5, h6 {{ font-family: system-ui, sans-serif; line-height: 1.25; }}
  pre, code {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }}
  pre {{ overflow-x: auto; padding: 0.75rem 1rem; background: #f4f5f4; }}
  blockquote {{ margin-left: 0; padding-left: 1rem; border-left: 3px solid #24c8db; color: #3a403c; }}
  img {{ max-width: 100%; height: auto; }}
  table {{ border-collapse: collapse; width: 100%; }}
  th, td {{ border: 1px solid #c9cec9; padding: 0.35rem 0.55rem; }}
</style>
</head>
<body>
{article}
</body>
</html>"#
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportDocumentByIdInput {
    pub document_id: String,
    pub format: String,
}

#[tauri::command]
pub async fn export_document_by_id(
    app: AppHandle,
    state: State<'_, DbState>,
    input: ExportDocumentByIdInput,
) -> Result<Option<ExportResult>, String> {
    let format = input.format.to_lowercase();
    let supported = matches!(
        format.as_str(),
        "md" | "markdown" | "txt" | "html" | "html-zip" | "epub"
    );
    if !supported {
        return Err(
            "export_document_by_id supports: md, txt, html, html-zip, epub".to_string(),
        );
    }

    let (title, content_json) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let (_id, title, content_json) = load_document_row(&conn, &input.document_id)?;
        (title, content_json)
    };

    let ext = match format.as_str() {
        "html-zip" => "zip",
        "markdown" => "md",
        other => other,
    };

    let dir = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        storage::get_documents_dir(&app, &conn)?
    };
    let default_path = export::default_export_path(&dir, &title, ext);

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
        "txt" => {
            let text = tiptap_to_plain_text(&content_json);
            export::export_plain_text(&text, &output)?;
        }
        "md" | "markdown" => {
            let body = tiptap_to_markdown(&content_json);
            let markdown = format!("# {title}\n\n{body}\n");
            export::export_markdown(&markdown, &output)?;
        }
        "html" => {
            let article = tiptap_to_html(&content_json, &title, true);
            let html = wrap_structural_html(&article, &title);
            export::export_html_file(&html, &output)?;
        }
        "html-zip" => {
            let article = tiptap_to_html(&content_json, &title, true);
            let html = wrap_structural_html(&article, &title);
            export::export_html_package(&html, &title, &output)?;
        }
        "epub" => {
            let article = tiptap_to_html(&content_json, &title, true);
            let html = wrap_structural_html(&article, &title);
            export::export_epub(&html, &title, &output)?;
        }
        _ => unreachable!(),
    }

    Ok(Some(ExportResult {
        path: output.to_string_lossy().to_string(),
    }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileDocumentsInput {
    pub title: String,
    pub chapter_ids: Vec<String>,
}

#[tauri::command]
pub fn compile_documents(
    app: AppHandle,
    state: State<'_, DbState>,
    input: CompileDocumentsInput,
) -> Result<Document, String> {
    if input.chapter_ids.is_empty() {
        return Err("Vyberte aspoň jednu kapitolu".to_string());
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut chapters: Vec<(String, String)> = Vec::with_capacity(input.chapter_ids.len());

    for chapter_id in &input.chapter_ids {
        let (_id, title, content_json) = load_document_row(&conn, chapter_id)?;
        chapters.push((title, content_json));
    }

    let content_json = merge_chapters(&chapters)?;
    let id = Uuid::new_v4().to_string();
    let now = now_ts();
    let title = {
        let trimmed = input.title.trim();
        if trimmed.is_empty() {
            "Kompilovaný rukopis".to_string()
        } else {
            trimmed.to_string()
        }
    };

    let folder_id = super::folders::default_folder_id(&conn)?;
    insert_document_record(
        &conn,
        &id,
        &title,
        &content_json,
        folder_id.clone(),
        now,
    )?;

    if let Err(error) = queue_document_persist(
        &app,
        &conn,
        &state.persist_queue,
        &id,
        &title,
        &content_json,
        now,
        now,
    ) {
        state.persist_queue.record_error(&id, error);
    }

    Ok(Document {
        id,
        title,
        content_json,
        folder_id,
        file_path: None,
        created_at: now,
        updated_at: now,
        vault_verifier: None,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffDocumentRevisionsInput {
    pub document_id: String,
    pub old_revision_id: String,
    pub new_revision_id: String,
    /// When comparing against `__current__`, optional plain text from the open
    /// editor (includes unsaved edits). TipTap JSON still stays in JS.
    pub current_plain_text: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffDocumentRevisionsResult {
    pub lines: Vec<scribe_core::DiffLine>,
    pub added: usize,
    pub removed: usize,
    pub old_text: String,
    pub new_text: String,
    pub side_by_side_rows: Vec<scribe_core::SideBySideRow>,
}

#[tauri::command]
pub fn diff_document_revisions(
    state: State<'_, DbState>,
    input: DiffDocumentRevisionsInput,
) -> Result<DiffDocumentRevisionsResult, String> {
    if input.old_revision_id == input.new_revision_id {
        return Err("Vyberte dve rôzne verzie".to_string());
    }

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let current = input.current_plain_text.as_deref();
    let old_text = load_revision_plain(
        &conn,
        &input.document_id,
        &input.old_revision_id,
        current,
    )?;
    let new_text = load_revision_plain(
        &conn,
        &input.document_id,
        &input.new_revision_id,
        current,
    )?;

    let DiffResult {
        lines,
        added,
        removed,
        side_by_side_rows,
    } = diff_lines(&old_text, &new_text);

    Ok(DiffDocumentRevisionsResult {
        lines,
        added,
        removed,
        old_text,
        new_text,
        side_by_side_rows,
    })
}

/// Convert TipTap JSON → plain text or markdown (canonical scribe-core serializers).
#[tauri::command]
pub fn convert_tiptap(content_json: String, format: String) -> Result<String, String> {
    match format.to_lowercase().as_str() {
        "plain" | "text" | "txt" => Ok(tiptap_to_plain_text(&content_json)),
        "markdown" | "md" => Ok(tiptap_to_markdown(&content_json)),
        other => Err(format!("Unsupported convert_tiptap format: {other}")),
    }
}

/// Diff two plain-text blobs (lines + word-level side-by-side).
#[tauri::command]
pub fn diff_plain_texts(old_text: String, new_text: String) -> DiffResult {
    diff_lines(&old_text, &new_text)
}

/// Document chat intent router (EN/SK) — same rules as Local AI chat chips.
#[tauri::command]
pub fn match_document_chat_intent(question: String) -> Option<String> {
    scribe_core::match_document_chat_intent(&question).map(str::to_string)
}

#[tauri::command]
pub fn match_agent_intents(question: String) -> Vec<String> {
    scribe_core::match_agent_intents(&question)
        .into_iter()
        .map(str::to_string)
        .collect()
}

/// Parse convention tags (`status:` / `project:` / `year:`).
#[tauri::command]
pub fn parse_meta_tag(raw: String) -> scribe_core::ParsedTag {
    scribe_core::parse_meta_tag(&raw)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaFiltersInput {
    pub status: Option<String>,
    pub project: Option<String>,
    pub year: Option<String>,
}

/// Whether a document's tags satisfy status/project/year filters.
#[tauri::command]
pub fn document_matches_meta_filters(tags: Vec<String>, filters: MetaFiltersInput) -> bool {
    scribe_core::document_matches_meta_filters(
        &tags,
        &scribe_core::MetaFilters {
            status: filters.status,
            project: filters.project,
            year: filters.year,
        },
    )
}

/// Render structural TipTap→HTML in Rust (no Mermaid/D3). Used when the caller
/// already has content JSON but wants to skip the TS serializer for plain docs.
#[tauri::command]
pub fn render_document_html(
    state: State<'_, DbState>,
    document_id: String,
    include_title_heading: Option<bool>,
) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let (_id, title, content_json) = load_document_row(&conn, &document_id)?;
    let include = include_title_heading.unwrap_or(true);
    let article = tiptap_to_html(&content_json, &title, include);
    Ok(wrap_structural_html(&article, &title))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrap_structural_html_escapes_title() {
        let html = wrap_structural_html("<article></article>", "A & B <C>");
        assert!(html.contains("A &amp; B &lt;C&gt;"));
        assert!(html.contains("<article></article>"));
    }
}
