use crate::commands::storage::{persist_document, queue_document_persist};
use crate::db::DbState;
use crate::storage;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub folder_id: Option<String>,
    pub file_path: Option<String>,
    pub updated_at: i64,
    pub is_favorite: bool,
    pub is_pinned: bool,
    pub tags: Vec<String>,
    pub deleted_at: Option<i64>,
}

fn parse_tags(raw: Option<String>) -> Vec<String> {
    raw.and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub title: String,
    pub content_json: String,
    pub folder_id: Option<String>,
    pub file_path: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentInput {
    pub title: String,
    pub folder_id: Option<String>,
    pub content_json: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDocumentInput {
    pub id: String,
    pub title: Option<String>,
    pub content_json: Option<String>,
}

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

fn normalize_document_title(title: &str) -> String {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        "Untitled".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Soft-deletes a document into trash. Returns true when a row was updated.
pub(crate) fn soft_delete_document_row(
    conn: &rusqlite::Connection,
    id: &str,
    now: i64,
) -> Result<bool, String> {
    let affected = conn
        .execute(
            "UPDATE documents SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            params![now, id],
        )
        .map_err(|e| e.to_string())?;

    if affected > 0 {
        crate::db::remove_document_fts(conn, id)?;
    }

    Ok(affected > 0)
}

fn folder_exists(conn: &rusqlite::Connection, folder_id: &str) -> Result<bool, String> {
    let exists: Option<String> = conn
        .query_row(
            "SELECT id FROM folders WHERE id = ?1",
            params![folder_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(exists.is_some())
}

pub fn map_document(row: &rusqlite::Row<'_>) -> rusqlite::Result<Document> {
    Ok(Document {
        id: row.get(0)?,
        title: row.get(1)?,
        content_json: row.get(2)?,
        folder_id: row.get(3)?,
        file_path: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

pub const DOCUMENT_SELECT: &str =
    "SELECT id, title, content_json, folder_id, file_path, created_at, updated_at FROM documents";

const SUMMARY_SELECT: &str =
    "SELECT id, title, folder_id, file_path, updated_at, is_favorite, is_pinned, tags, deleted_at FROM documents";

fn map_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<DocumentSummary> {
    Ok(DocumentSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        folder_id: row.get(2)?,
        file_path: row.get(3)?,
        updated_at: row.get(4)?,
        is_favorite: row.get::<_, i64>(5)? != 0,
        is_pinned: row.get::<_, i64>(6)? != 0,
        tags: parse_tags(row.get::<_, Option<String>>(7)?),
        deleted_at: row.get(8)?,
    })
}

#[tauri::command]
pub fn list_documents(state: State<'_, DbState>) -> Result<Vec<DocumentSummary>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    list_open_document_summaries(&conn)
}

pub(crate) fn list_open_document_summaries(
    conn: &rusqlite::Connection,
) -> Result<Vec<DocumentSummary>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "{SUMMARY_SELECT} WHERE deleted_at IS NULL ORDER BY updated_at DESC"
        ))
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], map_summary)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_trashed_documents(state: State<'_, DbState>) -> Result<Vec<DocumentSummary>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(&format!(
            "{SUMMARY_SELECT} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC"
        ))
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], map_summary)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_document(state: State<'_, DbState>, id: String) -> Result<Document, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("{DOCUMENT_SELECT} WHERE id = ?1"),
        params![id],
        map_document,
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Document not found: {id}"))
}

pub(crate) fn insert_document_record(
    conn: &rusqlite::Connection,
    id: &str,
    title: &str,
    content_json: &str,
    folder_id: Option<String>,
    now: i64,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5)",
        params![id, title, content_json, folder_id, now],
    )
    .map_err(|e| e.to_string())?;

    crate::db::sync_document_fts(conn, id, title, content_json)?;
    crate::db::sync_document_links(conn, id, content_json)?;
    Ok(())
}

#[tauri::command]
pub fn create_document(
    app: AppHandle,
    state: State<'_, DbState>,
    input: CreateDocumentInput,
) -> Result<Document, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let now = now_ts();
    let content_json = input
        .content_json
        .filter(|c| !c.trim().is_empty())
        .unwrap_or_else(|| r#"{"type":"doc","content":[{"type":"paragraph"}]}"#.to_string());

    let folder_id = match input.folder_id {
        Some(id) => Some(id),
        None => super::folders::default_folder_id(&conn)?,
    };

    let title = normalize_document_title(&input.title);

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
    })
}

#[tauri::command]
pub fn update_document(
    app: AppHandle,
    state: State<'_, DbState>,
    input: UpdateDocumentInput,
) -> Result<Document, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let existing = conn
        .query_row(
            &format!("{DOCUMENT_SELECT} WHERE id = ?1 AND deleted_at IS NULL"),
            params![input.id],
            map_document,
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Document not found: {}", input.id))?;

    let title = normalize_document_title(&input.title.unwrap_or(existing.title.clone()));
    let content_json = input
        .content_json
        .unwrap_or_else(|| existing.content_json.clone());
    let now = now_ts();
    let content_changed = content_json != existing.content_json || title != existing.title;

    conn.execute("BEGIN IMMEDIATE", [])
        .map_err(|e| e.to_string())?;

    let update_result = (|| -> Result<(), String> {
        if content_changed {
            crate::db::save_revision(
                &conn,
                &existing.id,
                &existing.title,
                &existing.content_json,
            )?;
        }

        conn.execute(
            "UPDATE documents SET title = ?1, content_json = ?2, updated_at = ?3 WHERE id = ?4",
            params![title, content_json, now, input.id],
        )
        .map_err(|e| e.to_string())?;

        crate::db::sync_document_fts(&conn, &input.id, &title, &content_json)?;
        crate::db::sync_document_links(&conn, &input.id, &content_json)?;
        Ok(())
    })();

    if let Err(error) = update_result {
        let _ = conn.execute("ROLLBACK", []);
        return Err(error);
    }

    conn.execute("COMMIT", [])
        .map_err(|e| e.to_string())?;

    if content_changed {
        if let Err(error) = queue_document_persist(
            &app,
            &conn,
            &state.persist_queue,
            &input.id,
            &title,
            &content_json,
            existing.created_at,
            now,
        ) {
            state.persist_queue.record_error(&input.id, error);
        }
    }

    Ok(Document {
        id: input.id,
        title,
        content_json,
        folder_id: existing.folder_id,
        file_path: existing.file_path,
        created_at: existing.created_at,
        updated_at: now,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateDocumentInput {
    pub id: String,
    pub title: Option<String>,
}

#[tauri::command]
pub fn duplicate_document(
    app: AppHandle,
    state: State<'_, DbState>,
    input: DuplicateDocumentInput,
) -> Result<Document, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let source = conn
        .query_row(
            &format!("{DOCUMENT_SELECT} WHERE id = ?1"),
            params![input.id],
            map_document,
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Document not found: {}", input.id))?;

    let new_id = Uuid::new_v4().to_string();
    let now = now_ts();
    let title = input
        .title
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("{} (kópia)", source.title));

    let dir = storage::get_documents_dir(&app, &conn)?;
    let content_json =
        storage::duplicate_document_assets(&dir, &source.id, &new_id, &source.content_json)?;

    conn.execute(
        "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5)",
        params![new_id, title, content_json, source.folder_id, now],
    )
    .map_err(|e| e.to_string())?;

    crate::db::sync_document_fts(&conn, &new_id, &title, &content_json)?;
    crate::db::sync_document_links(&conn, &new_id, &content_json)?;

    let file_path = persist_document(
        &app,
        &conn,
        &new_id,
        &title,
        &content_json,
        now,
        now,
    )?;

    Ok(Document {
        id: new_id,
        title,
        content_json,
        folder_id: source.folder_id,
        file_path: Some(file_path),
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub fn delete_document(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    soft_delete_document_row(&conn, &id, now_ts())?;
    Ok(())
}

#[tauri::command]
pub fn restore_document(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let restored = conn
        .query_row(
            &format!("{DOCUMENT_SELECT} WHERE id = ?1"),
            params![id],
            map_document,
        )
        .optional()
        .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE documents SET deleted_at = NULL WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    if let Some(doc) = restored {
        if let Some(folder_id) = &doc.folder_id {
            if !folder_exists(&conn, folder_id)? {
                let fallback = super::folders::default_folder_id(&conn)?;
                conn.execute(
                    "UPDATE documents SET folder_id = ?1 WHERE id = ?2",
                    params![fallback, id],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        crate::db::sync_document_fts(&conn, &doc.id, &doc.title, &doc.content_json)?;
        crate::db::sync_document_links(&conn, &doc.id, &doc.content_json)?;
    }

    Ok(())
}

#[tauri::command]
pub fn list_backlinks(
    state: State<'_, DbState>,
    id: String,
) -> Result<Vec<DocumentSummary>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.title, d.folder_id, d.file_path, d.updated_at, \
                    d.is_favorite, d.is_pinned, d.tags, d.deleted_at \
             FROM document_links l \
             JOIN documents d ON d.id = l.source_id \
             WHERE l.target_id = ?1 AND d.deleted_at IS NULL \
             ORDER BY d.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![id], map_summary)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_outgoing_links(
    state: State<'_, DbState>,
    id: String,
) -> Result<Vec<DocumentSummary>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT d.id, d.title, d.folder_id, d.file_path, d.updated_at, \
                    d.is_favorite, d.is_pinned, d.tags, d.deleted_at \
             FROM document_links l \
             JOIN documents d ON d.id = l.target_id \
             WHERE l.source_id = ?1 AND d.deleted_at IS NULL \
             ORDER BY d.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![id], map_summary)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn purge_document_row(conn: &rusqlite::Connection, id: &str) -> Result<(), String> {
    let file_path: Option<String> = conn
        .query_row(
            "SELECT file_path FROM documents WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();

    conn.execute("DELETE FROM documents WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    crate::db::remove_document_fts(conn, id)?;
    crate::db::remove_embedding(conn, id)?;

    if let Some(path) = file_path {
        storage::delete_document_file(&path)?;
    }

    Ok(())
}

#[tauri::command]
pub fn purge_document(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    purge_document_row(&conn, &id)
}

#[tauri::command]
pub fn empty_trash(state: State<'_, DbState>) -> Result<u32, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let ids: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT id FROM documents WHERE deleted_at IS NOT NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    let mut removed = 0u32;
    for id in ids {
        purge_document_row(&conn, &id)?;
        removed += 1;
    }

    Ok(removed)
}

#[tauri::command]
pub fn set_document_favorite(
    state: State<'_, DbState>,
    id: String,
    favorite: bool,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE documents SET is_favorite = ?1 WHERE id = ?2",
        params![if favorite { 1 } else { 0 }, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_document_pinned(
    state: State<'_, DbState>,
    id: String,
    pinned: bool,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE documents SET is_pinned = ?1 WHERE id = ?2",
        params![if pinned { 1 } else { 0 }, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_document_tags(
    state: State<'_, DbState>,
    id: String,
    tags: Vec<String>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    store_document_tags(&conn, &id, tags)
}

#[tauri::command]
pub fn add_document_tag(
    state: State<'_, DbState>,
    id: String,
    tag: String,
) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    Ok(scribe_core::add_document_tag(&conn, &id, &tag)?.tags)
}

#[tauri::command]
pub fn remove_document_tag(
    state: State<'_, DbState>,
    id: String,
    tag: String,
) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    Ok(scribe_core::remove_document_tag(&conn, &id, &tag)?.tags)
}

pub(crate) fn store_document_tags(
    conn: &rusqlite::Connection,
    id: &str,
    tags: Vec<String>,
) -> Result<(), String> {
    let mut cleaned: Vec<String> = tags
        .into_iter()
        .map(|tag| tag.trim().to_string())
        .filter(|tag| !tag.is_empty())
        .collect();
    cleaned.sort();
    cleaned.dedup();

    let encoded = serde_json::to_string(&cleaned).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE documents SET tags = ?1 WHERE id = ?2",
        params![encoded, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFindReplaceInput {
    pub query: String,
    pub replacement: String,
    pub dry_run: bool,
    pub folder_id: Option<String>,
    pub match_case: Option<bool>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFindReplaceHit {
    pub document_id: String,
    pub title: String,
    pub match_count: u32,
    pub preview: String,
}

fn chars_eq_ignore_case(a: char, b: char) -> bool {
    a == b || a.to_lowercase().eq(b.to_lowercase())
}

fn replace_occurrences(haystack: &str, needle: &str, replacement: &str, match_case: bool) -> String {
    if needle.is_empty() {
        return haystack.to_string();
    }
    if match_case {
        return haystack.replace(needle, replacement);
    }

    let needle_chars: Vec<char> = needle.chars().collect();
    let needle_len = needle_chars.len();
    if needle_len == 0 {
        return haystack.to_string();
    }

    let hay_chars: Vec<(usize, char)> = haystack.char_indices().collect();
    let mut result = String::with_capacity(haystack.len());
    let mut last_byte = 0usize;
    let mut i = 0usize;
    while i + needle_len <= hay_chars.len() {
        let matched = hay_chars[i..i + needle_len]
            .iter()
            .zip(needle_chars.iter())
            .all(|((_, hc), nc)| chars_eq_ignore_case(*hc, *nc));
        if matched {
            let start = hay_chars[i].0;
            let end = if i + needle_len < hay_chars.len() {
                hay_chars[i + needle_len].0
            } else {
                haystack.len()
            };
            result.push_str(&haystack[last_byte..start]);
            result.push_str(replacement);
            last_byte = end;
            i += needle_len;
        } else {
            i += 1;
        }
    }
    result.push_str(&haystack[last_byte..]);
    result
}

fn count_occurrences(haystack: &str, needle: &str, match_case: bool) -> usize {
    if needle.is_empty() {
        return 0;
    }
    if match_case {
        return haystack.matches(needle).count();
    }

    let needle_chars: Vec<char> = needle.chars().collect();
    let needle_len = needle_chars.len();
    if needle_len == 0 {
        return 0;
    }
    let hay_chars: Vec<char> = haystack.chars().collect();
    let mut count = 0usize;
    let mut i = 0usize;
    while i + needle_len <= hay_chars.len() {
        let matched = hay_chars[i..i + needle_len]
            .iter()
            .zip(needle_chars.iter())
            .all(|(hc, nc)| chars_eq_ignore_case(*hc, *nc));
        if matched {
            count += 1;
            i += needle_len;
        } else {
            i += 1;
        }
    }
    count
}

/// Replace `query` only inside TipTap text nodes `{"type":"text","text":"..."}`.
/// Skips `attrs` and other non-text fields. Returns number of substring replacements.
fn replace_in_tiptap_text_nodes(
    value: &mut serde_json::Value,
    query: &str,
    replacement: &str,
    match_case: bool,
) -> usize {
    let mut count = 0usize;
    match value {
        serde_json::Value::Object(map) => {
            let is_text_node = map
                .get("type")
                .and_then(|v| v.as_str())
                == Some("text");

            if is_text_node {
                if let Some(serde_json::Value::String(text)) = map.get_mut("text") {
                    let n = count_occurrences(text, query, match_case);
                    if n > 0 {
                        *text = replace_occurrences(text, query, replacement, match_case);
                        count += n;
                    }
                }
            }

            for (key, child) in map.iter_mut() {
                if key == "attrs" {
                    continue;
                }
                if is_text_node && key == "text" {
                    continue;
                }
                count += replace_in_tiptap_text_nodes(child, query, replacement, match_case);
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                count += replace_in_tiptap_text_nodes(item, query, replacement, match_case);
            }
        }
        _ => {}
    }
    count
}

fn count_in_tiptap_text_nodes(value: &serde_json::Value, query: &str, match_case: bool) -> usize {
    let mut count = 0usize;
    match value {
        serde_json::Value::Object(map) => {
            let is_text_node = map.get("type").and_then(|v| v.as_str()) == Some("text");
            if is_text_node {
                if let Some(serde_json::Value::String(text)) = map.get("text") {
                    count += count_occurrences(text, query, match_case);
                }
            }
            for (key, child) in map.iter() {
                if key == "attrs" {
                    continue;
                }
                if is_text_node && key == "text" {
                    continue;
                }
                count += count_in_tiptap_text_nodes(child, query, match_case);
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                count += count_in_tiptap_text_nodes(item, query, match_case);
            }
        }
        _ => {}
    }
    count
}

fn preview_around_match(haystack: &str, query: &str, match_case: bool) -> Option<String> {
    if query.is_empty() || haystack.is_empty() {
        return None;
    }
    let (start, end) = if match_case {
        let idx = haystack.find(query)?;
        (idx, idx + query.len())
    } else {
        let needle_chars: Vec<char> = query.chars().collect();
        let needle_len = needle_chars.len();
        let hay_chars: Vec<(usize, char)> = haystack.char_indices().collect();
        let mut found = None;
        let mut i = 0usize;
        while i + needle_len <= hay_chars.len() {
            let matched = hay_chars[i..i + needle_len]
                .iter()
                .zip(needle_chars.iter())
                .all(|((_, hc), nc)| chars_eq_ignore_case(*hc, *nc));
            if matched {
                let start = hay_chars[i].0;
                let end = if i + needle_len < hay_chars.len() {
                    hay_chars[i + needle_len].0
                } else {
                    haystack.len()
                };
                found = Some((start, end));
                break;
            }
            i += 1;
        }
        found?
    };
    let context = 36usize;
    let from = floor_char_boundary(haystack, start.saturating_sub(context));
    let to = ceil_char_boundary(haystack, (end + context).min(haystack.len()));
    let mut preview = String::new();
    if from > 0 {
        preview.push('…');
    }
    preview.push_str(haystack[from..to].trim());
    if to < haystack.len() {
        preview.push('…');
    }
    Some(preview)
}

fn floor_char_boundary(s: &str, mut index: usize) -> usize {
    if index >= s.len() {
        return s.len();
    }
    while index > 0 && !s.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn ceil_char_boundary(s: &str, mut index: usize) -> usize {
    if index >= s.len() {
        return s.len();
    }
    while index < s.len() && !s.is_char_boundary(index) {
        index += 1;
    }
    index
}

fn library_find_replace_preview(
    title: &str,
    content_json: &str,
    query: &str,
    match_case: bool,
) -> String {
    let body = crate::db::extract_search_text(content_json);
    preview_around_match(&body, query, match_case)
        .or_else(|| preview_around_match(title, query, match_case))
        .unwrap_or_else(|| title.to_string())
}

#[tauri::command]
pub fn library_find_replace(
    app: AppHandle,
    state: State<'_, DbState>,
    input: LibraryFindReplaceInput,
) -> Result<Vec<LibraryFindReplaceHit>, String> {
    let query = input.query;
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let match_case = input.match_case.unwrap_or(false);
    let replacement = input.replacement;
    let dry_run = input.dry_run;

    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = match &input.folder_id {
        Some(_) => conn
            .prepare(&format!(
                "{DOCUMENT_SELECT} WHERE deleted_at IS NULL AND folder_id = ?1 ORDER BY updated_at DESC"
            ))
            .map_err(|e| e.to_string())?,
        None => conn
            .prepare(&format!(
                "{DOCUMENT_SELECT} WHERE deleted_at IS NULL ORDER BY updated_at DESC"
            ))
            .map_err(|e| e.to_string())?,
    };

    let docs: Vec<Document> = match &input.folder_id {
        Some(folder_id) => {
            let rows = stmt
                .query_map(params![folder_id], map_document)
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        }
        None => {
            let rows = stmt
                .query_map([], map_document)
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        }
    };

    let mut hits: Vec<LibraryFindReplaceHit> = Vec::new();
    let mut pending_persists: Vec<(Document, i64)> = Vec::new();

    if !dry_run {
        conn.execute("BEGIN IMMEDIATE", [])
            .map_err(|e| e.to_string())?;
    }

    let apply_result = (|| -> Result<(), String> {
        for doc in docs {
            let title_matches = count_occurrences(&doc.title, &query, match_case);
            let mut parsed: serde_json::Value =
                serde_json::from_str(&doc.content_json).unwrap_or(serde_json::json!({
                    "type": "doc",
                    "content": [{"type": "paragraph"}]
                }));

            let content_matches = if dry_run {
                count_in_tiptap_text_nodes(&parsed, &query, match_case)
            } else {
                replace_in_tiptap_text_nodes(&mut parsed, &query, &replacement, match_case)
            };

            let match_count = title_matches + content_matches;
            if match_count == 0 {
                continue;
            }

            let preview =
                library_find_replace_preview(&doc.title, &doc.content_json, &query, match_case);

            if dry_run {
                hits.push(LibraryFindReplaceHit {
                    document_id: doc.id,
                    title: doc.title,
                    match_count: match_count as u32,
                    preview,
                });
                continue;
            }

            let new_title = if title_matches > 0 {
                normalize_document_title(&replace_occurrences(
                    &doc.title,
                    &query,
                    &replacement,
                    match_case,
                ))
            } else {
                doc.title.clone()
            };

            let new_content = serde_json::to_string(&parsed).map_err(|e| e.to_string())?;
            let content_changed = new_content != doc.content_json || new_title != doc.title;
            if !content_changed {
                continue;
            }

            let now = now_ts();
            crate::db::save_revision(&conn, &doc.id, &doc.title, &doc.content_json)?;
            conn.execute(
                "UPDATE documents SET title = ?1, content_json = ?2, updated_at = ?3 WHERE id = ?4",
                params![new_title, new_content, now, doc.id],
            )
            .map_err(|e| e.to_string())?;
            crate::db::sync_document_fts(&conn, &doc.id, &new_title, &new_content)?;
            crate::db::sync_document_links(&conn, &doc.id, &new_content)?;

            hits.push(LibraryFindReplaceHit {
                document_id: doc.id.clone(),
                title: new_title.clone(),
                match_count: match_count as u32,
                preview,
            });

            let created_at = doc.created_at;
            pending_persists.push((
                Document {
                    id: doc.id,
                    title: new_title,
                    content_json: new_content,
                    folder_id: doc.folder_id,
                    file_path: doc.file_path,
                    created_at,
                    updated_at: now,
                },
                created_at,
            ));
        }
        Ok(())
    })();

    if !dry_run {
        if let Err(error) = apply_result {
            let _ = conn.execute("ROLLBACK", []);
            return Err(error);
        }
        conn.execute("COMMIT", []).map_err(|e| e.to_string())?;

        for (doc, created_at) in pending_persists {
            if let Err(error) = queue_document_persist(
                &app,
                &conn,
                &state.persist_queue,
                &doc.id,
                &doc.title,
                &doc.content_json,
                created_at,
                doc.updated_at,
            ) {
                state.persist_queue.record_error(&doc.id, error);
            }
        }
    } else {
        apply_result?;
    }

    Ok(hits)
}

#[tauri::command]
pub fn clear_all_documents(app: AppHandle, state: State<'_, DbState>) -> Result<u32, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let dir = storage::get_documents_dir(&app, &conn)?;

    conn.execute("DELETE FROM documents", [])
        .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM documents_fts", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM document_revisions", [])
        .map_err(|e| e.to_string())?;
    let _ = conn.execute("DELETE FROM comments", []);
    let _ = conn.execute("DELETE FROM comment_threads", []);

    let mut removed = 0u32;
    let mut paths = Vec::new();
    storage::collect_scribe_files(&dir, &mut paths)?;
    for path in paths {
        storage::delete_document_file(&path.to_string_lossy())?;
        removed += 1;
    }

    let assets_dir = dir.join("assets");
    if assets_dir.exists() {
        std::fs::remove_dir_all(&assets_dir)
            .map_err(|e| format!("Nepodarilo sa vymazať obrázky: {e}"))?;
    }

    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::{in_memory_conn, seed_document, seed_folder};

    #[test]
    fn list_open_documents_excludes_trashed() {
        let conn = in_memory_conn();
        seed_folder(&conn, "f1", "Folder", None);
        seed_document(
            &conn,
            "d1",
            "Open",
            r#"{"type":"doc","content":[]}"#,
            Some("f1"),
        );
        seed_document(
            &conn,
            "d2",
            "Trashed",
            r#"{"type":"doc","content":[]}"#,
            Some("f1"),
        );
        conn.execute("UPDATE documents SET deleted_at = 99 WHERE id = 'd2'", [])
            .unwrap();

        let listed = list_open_document_summaries(&conn).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "d1");
    }

    #[test]
    fn insert_document_record_indexes_search_and_links() {
        let conn = in_memory_conn();
        seed_document(&conn, "tgt", "Target", r#"{"type":"doc","content":[]}"#, None);
        let content = r#"{"type":"doc","content":[
            {"type":"wikiLink","attrs":{"targetId":"tgt"}}
        ]}"#;
        insert_document_record(&conn, "src", "Source doc", content, None, 100).unwrap();

        let hits = crate::db::search_documents_in_conn(&conn, "Source", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].document_id, "src");

        let backlink_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM document_links WHERE source_id = 'src' AND target_id = 'tgt'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(backlink_count, 1);
    }

    #[test]
    fn soft_delete_hides_document_from_open_list() {
        let conn = in_memory_conn();
        seed_document(&conn, "d1", "Doc", r#"{"type":"doc","content":[]}"#, None);

        assert!(soft_delete_document_row(&conn, "d1", 200).unwrap());
        assert!(list_open_document_summaries(&conn).unwrap().is_empty());
    }

    #[test]
    fn store_document_tags_normalizes_values() {
        let conn = in_memory_conn();
        seed_document(&conn, "d1", "Doc", r#"{"type":"doc","content":[]}"#, None);

        store_document_tags(
            &conn,
            "d1",
            vec![" beta ".into(), "alpha".into(), "alpha".into()],
        )
        .unwrap();

        let tags: String = conn
            .query_row("SELECT tags FROM documents WHERE id = 'd1'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(tags, r#"["alpha","beta"]"#);
    }

    #[test]
    fn add_and_remove_document_tag() {
        let conn = in_memory_conn();
        seed_document(&conn, "d1", "Doc", r#"{"type":"doc","content":[]}"#, None);

        let added = scribe_core::add_document_tag(&conn, "d1", "work").unwrap();
        assert_eq!(added.tags, vec!["work".to_string()]);

        let again = scribe_core::add_document_tag(&conn, "d1", "work").unwrap();
        assert_eq!(again.tags, vec!["work".to_string()]);

        let with_second = scribe_core::add_document_tag(&conn, "d1", "urgent").unwrap();
        assert_eq!(with_second.tags, vec!["urgent".to_string(), "work".to_string()]);

        let removed = scribe_core::remove_document_tag(&conn, "d1", "work").unwrap();
        assert_eq!(removed.tags, vec!["urgent".to_string()]);
    }

    #[test]
    fn replace_in_tiptap_skips_attrs() {
        let mut doc = serde_json::json!({
            "type": "doc",
            "content": [{
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "Hello foo world"},
                    {
                        "type": "wikiLink",
                        "attrs": {"targetId": "foo-id", "label": "foo"},
                        "content": [{"type": "text", "text": "foo link"}]
                    }
                ]
            }]
        });

        let count = replace_in_tiptap_text_nodes(&mut doc, "foo", "bar", true);
        assert_eq!(count, 2);
        let json = doc.to_string();
        assert!(json.contains("Hello bar world"));
        assert!(json.contains("bar link"));
        assert!(json.contains("\"targetId\":\"foo-id\""));
        assert!(json.contains("\"label\":\"foo\""));
    }

    #[test]
    fn replace_occurrences_case_insensitive() {
        assert_eq!(
            replace_occurrences("Foo FOO foo", "foo", "x", false),
            "x x x"
        );
        assert_eq!(
            replace_occurrences("Foo FOO foo", "foo", "x", true),
            "Foo FOO x"
        );
    }
}
