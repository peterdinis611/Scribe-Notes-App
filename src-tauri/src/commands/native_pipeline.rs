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
    diff_lines, document_is_vault, highlight_code_html, merge_chapters, tiptap_to_csv,
    tiptap_to_html, tiptap_to_markdown, tiptap_to_opml, tiptap_to_plain_text,
    tiptap_to_structured_json, DiffResult,
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
        "md" | "markdown" | "txt" | "html" | "html-zip" | "epub" | "csv" | "json" | "opml"
    );
    if !supported {
        return Err(
            "export_document_by_id supports: md, txt, html, html-zip, epub, csv, json, opml"
                .to_string(),
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
        "csv" => {
            let csv = tiptap_to_csv(&content_json, &title);
            export::export_plain_text(&csv, &output)?;
        }
        "json" => {
            let json = tiptap_to_structured_json(&content_json, &title)?;
            export::export_plain_text(&json, &output)?;
        }
        "opml" => {
            let opml = tiptap_to_opml(&content_json, &title)?;
            export::export_plain_text(&opml, &output)?;
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
        tags: Vec::new(),
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
    /// When true, return only change hunks (+ optional context) — avoids a
    /// second `filter_diff_lines_ui` round-trip of the full line array.
    pub changes_only: Option<bool>,
    pub context_lines: Option<usize>,
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

    let changes_only = input.changes_only.unwrap_or(false);
    let context = input.context_lines.unwrap_or(2);
    let (lines, side_by_side_rows) = if changes_only {
        (
            filter_core_diff_lines(&lines, context),
            filter_core_side_by_side(&side_by_side_rows, context),
        )
    } else {
        (lines, side_by_side_rows)
    };

    Ok(DiffDocumentRevisionsResult {
        lines,
        added,
        removed,
        old_text,
        new_text,
        side_by_side_rows,
    })
}

fn filter_core_diff_lines(
    lines: &[scribe_core::DiffLine],
    context_lines: usize,
) -> Vec<scribe_core::DiffLine> {
    use std::collections::HashSet;
    if context_lines == 0 {
        return lines
            .iter()
            .filter(|line| line.line_type != scribe_core::DiffLineType::Unchanged)
            .cloned()
            .collect();
    }
    let mut keep = HashSet::new();
    for (index, line) in lines.iter().enumerate() {
        if line.line_type == scribe_core::DiffLineType::Unchanged {
            continue;
        }
        let start = index.saturating_sub(context_lines);
        let end = (index + context_lines).min(lines.len().saturating_sub(1));
        for i in start..=end {
            keep.insert(i);
        }
    }
    lines
        .iter()
        .enumerate()
        .filter(|(i, _)| keep.contains(i))
        .map(|(_, line)| line.clone())
        .collect()
}

fn filter_core_side_by_side(
    rows: &[scribe_core::SideBySideRow],
    context_lines: usize,
) -> Vec<scribe_core::SideBySideRow> {
    use std::collections::HashSet;
    let is_change = |row: &scribe_core::SideBySideRow| {
        row.left.line_type != Some(scribe_core::DiffLineType::Unchanged)
            || row.right.line_type != Some(scribe_core::DiffLineType::Unchanged)
    };
    if context_lines == 0 {
        return rows.iter().filter(|row| is_change(row)).cloned().collect();
    }
    let mut keep = HashSet::new();
    for (index, row) in rows.iter().enumerate() {
        if !is_change(row) {
            continue;
        }
        let start = index.saturating_sub(context_lines);
        let end = (index + context_lines).min(rows.len().saturating_sub(1));
        for i in start..=end {
            keep.insert(i);
        }
    }
    rows.iter()
        .enumerate()
        .filter(|(i, _)| keep.contains(i))
        .map(|(_, row)| row.clone())
        .collect()
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

/// Agent composer slash catalog (optional scope filter: document|library|folder).
#[tauri::command]
pub fn list_agent_slash_commands(scope: Option<String>) -> Vec<scribe_core::AgentSlashCommandDef> {
    scribe_core::list_agent_slash_commands(scope.as_deref())
}

#[tauri::command]
pub fn filter_agent_slash_commands(
    query: String,
    scope: String,
    limit: Option<u32>,
) -> Vec<scribe_core::AgentSlashCommandDef> {
    scribe_core::filter_agent_slash_commands(&query, &scope, limit.unwrap_or(10) as usize)
}

#[tauri::command]
pub fn parse_agent_slash(raw: String, scope: String) -> scribe_core::ParsedAgentSlash {
    scribe_core::parse_agent_slash(&raw, &scope)
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

/// Syntax-highlight a code block with the same syntect/two-face pack as Rust HTML export.
/// Returns a self-contained `<pre>…</pre>` snippet, or `None` when the language is unknown.
#[tauri::command]
pub fn highlight_code(language: String, code: String) -> Option<String> {
    highlight_code_html(&language, &code)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportWikiPackInput {
    pub document_ids: Vec<String>,
    pub root_id: String,
    pub root_title: Option<String>,
    pub hops: Option<u32>,
}

/// Batch-export notes as Markdown + HTML under a picked folder (TipTap stays in SQLite).
#[tauri::command]
pub fn export_wiki_pack(
    app: AppHandle,
    state: State<'_, DbState>,
    input: ExportWikiPackInput,
) -> Result<Option<String>, String> {
    if input.document_ids.is_empty() {
        return Err("Žiadne dokumenty na export".to_string());
    }

    let default_name = format!(
        "{}-pack",
        scribe_ui::sanitize_file_stem(
            input.root_title.as_deref().unwrap_or("wiki-pack"),
            60
        )
    );
    let picked = app
        .dialog()
        .file()
        .set_title("Export wiki pack")
        .set_file_name(&format!("{default_name}/README.md"))
        .blocking_save_file();
    let Some(path) = picked else {
        return Ok(None);
    };
    let marker = PathBuf::from(path.to_string());
    let folder = marker
        .parent()
        .ok_or_else(|| "Neplatná cieľová cesta".to_string())?
        .to_path_buf();
    let notes_dir = folder.join("notes");
    let pages_dir = folder.join("pages");
    std::fs::create_dir_all(&notes_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&pages_dir).map_err(|e| e.to_string())?;

    let hops = input.hops.unwrap_or(2);
    let mut index_lines = vec![
        format!(
            "# Wiki pack — {}",
            input.root_title.as_deref().unwrap_or("Untitled").trim()
        ),
        String::new(),
        format!("Notes within {hops} hop(s) of the root:"),
        String::new(),
    ];

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    for id in &input.document_ids {
        let Ok((_id, title, content_json)) = load_document_row(&conn, id) else {
            continue;
        };
        let stem = scribe_ui::sanitize_file_stem(&title, 80);
        let body_md = tiptap_to_markdown(&content_json);
        let md = format!("# {title}\n\n{body_md}\n");
        std::fs::write(notes_dir.join(format!("{stem}.md")), md.as_bytes())
            .map_err(|e| e.to_string())?;
        let article = tiptap_to_html(&content_json, &title, true);
        let html = wrap_structural_html(&article, &title);
        std::fs::write(pages_dir.join(format!("{stem}.html")), html.as_bytes())
            .map_err(|e| e.to_string())?;
        let mark = if id == &input.root_id { " (root)" } else { "" };
        index_lines.push(format!("- [[notes/{stem}]]{mark}"));
    }
    drop(conn);

    std::fs::write(&marker, format!("{}\n", index_lines.join("\n")).as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(Some(folder.to_string_lossy().to_string()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishWikiSiteInput {
    pub document_ids: Vec<String>,
    pub site_title: Option<String>,
}

/// Batch-publish notes as a static HTML wiki (TipTap stays in SQLite).
#[tauri::command]
pub fn publish_wiki_site(
    app: AppHandle,
    state: State<'_, DbState>,
    input: PublishWikiSiteInput,
) -> Result<Option<String>, String> {
    if input.document_ids.is_empty() {
        return Err("Žiadne dokumenty na publikáciu".to_string());
    }

    let picked = app
        .dialog()
        .file()
        .set_title("Publish local wiki")
        .set_file_name("scribe-wiki/index.html")
        .blocking_save_file();
    let Some(path) = picked else {
        return Ok(None);
    };
    let index_path = PathBuf::from(path.to_string());
    let folder = index_path
        .parent()
        .ok_or_else(|| "Neplatná cieľová cesta".to_string())?
        .to_path_buf();
    let pages_dir = folder.join("pages");
    std::fs::create_dir_all(&pages_dir).map_err(|e| e.to_string())?;

    let site_title = input
        .site_title
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Scribe wiki")
        .to_string();

    let mut page_meta: Vec<(String, String, String)> = Vec::new();
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    for id in input.document_ids.iter().take(200) {
        let Ok((_id, title, content_json)) = load_document_row(&conn, id) else {
            continue;
        };
        let stem = scribe_ui::sanitize_file_stem(&title, 60);
        let file = format!("{stem}-{}.html", &id[..id.len().min(8)]);
        let article = tiptap_to_html(&content_json, &title, false);
        let nav = format!(
            r#"<a href="../index.html">{}</a>"#,
            scribe_core::escape_html(&site_title)
        );
        let page = format!(
            r#"<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>{title}</title>
<style>
  body {{ margin:0; font:16px/1.55 Georgia, serif; color:#1a1814; background:#f7f4ef; }}
  .wrap {{ max-width:920px; margin:0 auto; padding:2.5rem 1.25rem 4rem; }}
  nav {{ margin-bottom:2rem; padding-bottom:1rem; border-bottom:1px solid #ddd6cb; }}
  nav a {{ color:#0f766e; }}
  article img {{ max-width:100%; }}
  article table {{ border-collapse:collapse; width:100%; }}
  article th, article td {{ border:1px solid #ddd6cb; padding:.4rem .55rem; }}
</style></head>
<body><div class="wrap"><nav>{nav}</nav><article>{article}</article></div></body></html>"#,
            title = scribe_core::escape_html(&title),
            nav = nav,
            article = article,
        );
        std::fs::write(pages_dir.join(&file), page.as_bytes()).map_err(|e| e.to_string())?;
        page_meta.push((id.clone(), title, file));
    }
    drop(conn);

    let nav = page_meta
        .iter()
        .map(|(_, title, file)| {
            format!(
                r#"<a href="pages/{}">{}</a>"#,
                scribe_core::escape_html(file),
                scribe_core::escape_html(title)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    let list = page_meta
        .iter()
        .map(|(_, title, file)| {
            format!(
                r#"<li><a href="pages/{}">{}</a></li>"#,
                scribe_core::escape_html(file),
                scribe_core::escape_html(title)
            )
        })
        .collect::<Vec<_>>()
        .join("");
    let index = format!(
        r#"<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>{site}</title>
<style>
  body {{ margin:0; font:16px/1.55 Georgia, serif; color:#1a1814; background:#f7f4ef; }}
  .wrap {{ max-width:920px; margin:0 auto; padding:2.5rem 1.25rem 4rem; }}
  nav {{ display:flex; flex-wrap:wrap; gap:.75rem 1.25rem; margin-bottom:2rem; padding-bottom:1rem; border-bottom:1px solid #ddd6cb; }}
  nav a {{ color:#0f766e; }}
</style></head>
<body><div class="wrap"><nav>{nav}</nav>
<h1>{site}</h1><p>{count} notes</p><ul>{list}</ul>
</div></body></html>"#,
        site = scribe_core::escape_html(&site_title),
        nav = nav,
        count = page_meta.len(),
        list = list,
    );
    std::fs::write(&index_path, index.as_bytes()).map_err(|e| e.to_string())?;
    Ok(Some(folder.to_string_lossy().to_string()))
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
