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
    "SELECT id, title, folder_id, file_path, updated_at, is_favorite, tags, deleted_at FROM documents";

fn map_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<DocumentSummary> {
    Ok(DocumentSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        folder_id: row.get(2)?,
        file_path: row.get(3)?,
        updated_at: row.get(4)?,
        is_favorite: row.get::<_, i64>(5)? != 0,
        tags: parse_tags(row.get::<_, Option<String>>(6)?),
        deleted_at: row.get(7)?,
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

    insert_document_record(
        &conn,
        &id,
        &input.title,
        &content_json,
        folder_id.clone(),
        now,
    )?;

    if let Err(error) = queue_document_persist(
        &app,
        &conn,
        &state.persist_queue,
        &id,
        &input.title,
        &content_json,
        now,
        now,
    ) {
        state.persist_queue.record_error(&id, error);
    }

    Ok(Document {
        id,
        title: input.title,
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
            &format!("{DOCUMENT_SELECT} WHERE id = ?1"),
            params![input.id],
            map_document,
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Document not found: {}", input.id))?;

    let title = input.title.unwrap_or(existing.title.clone());
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
                    d.is_favorite, d.tags, d.deleted_at \
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
                    d.is_favorite, d.tags, d.deleted_at \
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
pub fn set_document_tags(
    state: State<'_, DbState>,
    id: String,
    tags: Vec<String>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    store_document_tags(&conn, &id, tags)
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

        let hits = crate::db::search::search_documents_in_conn(&conn, "Source", 10).unwrap();
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
}
