use crate::commands::documents::soft_delete_document_row;
use crate::db::DbState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

fn map_folder(row: &rusqlite::Row<'_>) -> rusqlite::Result<Folder> {
    Ok(Folder {
        id: row.get(0)?,
        name: row.get(1)?,
        parent_id: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

#[tauri::command]
pub fn list_folders(state: State<'_, DbState>) -> Result<Vec<Folder>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, parent_id, created_at, updated_at FROM folders ORDER BY name COLLATE NOCASE ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], map_folder)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderInput {
    pub name: String,
    pub parent_id: Option<String>,
}

#[tauri::command]
pub fn create_folder(state: State<'_, DbState>, input: CreateFolderInput) -> Result<Folder, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let now = now_ts();
    let name = input.name.trim();
    if name.is_empty() {
        return Err("Názov priečinka nemôže byť prázdny".to_string());
    }

    conn.execute(
        "INSERT INTO folders (id, name, parent_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        params![id, name, input.parent_id, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(Folder {
        id,
        name: name.to_string(),
        parent_id: input.parent_id,
        created_at: now,
        updated_at: now,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameFolderInput {
    pub id: String,
    pub name: String,
}

#[tauri::command]
pub fn rename_folder(state: State<'_, DbState>, input: RenameFolderInput) -> Result<Folder, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let name = input.name.trim();
    if name.is_empty() {
        return Err("Názov priečinka nemôže byť prázdny".to_string());
    }
    let now = now_ts();

    conn.execute(
        "UPDATE folders SET name = ?1, updated_at = ?2 WHERE id = ?3",
        params![name, now, input.id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, name, parent_id, created_at, updated_at FROM folders WHERE id = ?1",
        params![input.id],
        map_folder,
    )
    .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFolderResult {
    pub deleted_document_ids: Vec<String>,
    pub deleted_folder_ids: Vec<String>,
}

fn collect_folder_subtree_ids(conn: &Connection, root_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            WITH RECURSIVE folder_tree(id) AS (
                SELECT id FROM folders WHERE id = ?1
                UNION ALL
                SELECT f.id FROM folders f
                INNER JOIN folder_tree ft ON f.parent_id = ft.id
            )
            SELECT id FROM folder_tree
            "#,
        )
        .map_err(|e| e.to_string())?;

    let ids = stmt
        .query_map(params![root_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(ids)
}

fn collect_document_ids_in_folders(
    conn: &Connection,
    folder_ids: &[String],
) -> Result<Vec<String>, String> {
    if folder_ids.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders = std::iter::repeat("?")
        .take(folder_ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT id FROM documents WHERE folder_id IN ({placeholders}) AND deleted_at IS NULL"
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(folder_ids.iter()), |row| row.get(0))
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashFolderDocumentsResult {
    pub trashed_document_ids: Vec<String>,
}

#[tauri::command]
pub fn trash_folder_documents(
    state: State<'_, DbState>,
    folder_id: String,
) -> Result<TrashFolderDocumentsResult, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = now_ts();

    let folder_ids = collect_folder_subtree_ids(&conn, &folder_id)?;
    if folder_ids.is_empty() {
        return Err("Priečinok neexistuje".to_string());
    }

    let document_ids = collect_document_ids_in_folders(&conn, &folder_ids)?;
    let mut trashed_document_ids = Vec::new();

    for document_id in document_ids {
        if soft_delete_document_row(&conn, &document_id, now)? {
            trashed_document_ids.push(document_id);
        }
    }

    Ok(TrashFolderDocumentsResult {
        trashed_document_ids,
    })
}

#[tauri::command]
pub fn delete_folder(
    _app: AppHandle,
    state: State<'_, DbState>,
    id: String,
) -> Result<DeleteFolderResult, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    conn.execute("BEGIN IMMEDIATE", [])
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<DeleteFolderResult, String> {
        let folder_ids = collect_folder_subtree_ids(&conn, &id)?;
        if folder_ids.is_empty() {
            return Err("Priečinok neexistuje".to_string());
        }

        let now = now_ts();
        let document_ids = collect_document_ids_in_folders(&conn, &folder_ids)?;
        let mut deleted_document_ids = Vec::new();

        for document_id in document_ids {
            if soft_delete_document_row(&conn, &document_id, now)? {
                deleted_document_ids.push(document_id);
            }
        }

        conn.execute("DELETE FROM folders WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;

        Ok(DeleteFolderResult {
            deleted_document_ids,
            deleted_folder_ids: folder_ids,
        })
    })();

    if result.is_err() {
        let _ = conn.execute("ROLLBACK", []);
        return Err(result.err().unwrap());
    }

    conn.execute("COMMIT", [])
        .map_err(|e| e.to_string())?;

    result
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveFolderInput {
    pub id: String,
    pub parent_id: Option<String>,
}

#[tauri::command]
pub fn move_folder(state: State<'_, DbState>, input: MoveFolderInput) -> Result<Folder, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = now_ts();

    if input.parent_id.as_deref() == Some(input.id.as_str()) {
        return Err("Priečinok nemôže byť presunutý do seba".to_string());
    }

    conn.execute(
        "UPDATE folders SET parent_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![input.parent_id, now, input.id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, name, parent_id, created_at, updated_at FROM folders WHERE id = ?1",
        params![input.id],
        map_folder,
    )
    .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveDocumentInput {
    pub document_id: String,
    pub folder_id: Option<String>,
}

#[tauri::command]
pub fn move_document_to_folder(
    state: State<'_, DbState>,
    input: MoveDocumentInput,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = now_ts();

    if let Some(folder_id) = &input.folder_id {
        let exists: Option<String> = conn
            .query_row(
                "SELECT id FROM folders WHERE id = ?1",
                params![folder_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        if exists.is_none() {
            return Err("Priečinok neexistuje".to_string());
        }
    }

    conn.execute(
        "UPDATE documents SET folder_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![input.folder_id, now, input.document_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn default_folder_id(conn: &rusqlite::Connection) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT id FROM folders ORDER BY created_at ASC LIMIT 1",
        [],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::{in_memory_conn, seed_document, seed_folder};

    #[test]
    fn collect_document_ids_uses_single_query_for_multiple_folders() {
        let conn = in_memory_conn();
        seed_folder(&conn, "f1", "One", None);
        seed_folder(&conn, "f2", "Two", None);
        seed_document(&conn, "d1", "A", r#"{"type":"doc","content":[]}"#, Some("f1"));
        seed_document(&conn, "d2", "B", r#"{"type":"doc","content":[]}"#, Some("f2"));
        seed_document(&conn, "d3", "C", r#"{"type":"doc","content":[]}"#, Some("f1"));

        let ids = collect_document_ids_in_folders(&conn, &["f1".into(), "f2".into()]).unwrap();
        let mut sorted = ids;
        sorted.sort();
        assert_eq!(sorted, vec!["d1".to_string(), "d2".to_string(), "d3".to_string()]);
    }

    #[test]
    fn collect_folder_subtree_includes_nested_children() {
        let conn = in_memory_conn();
        seed_folder(&conn, "root", "Root", None);
        seed_folder(&conn, "child", "Child", Some("root"));
        seed_folder(&conn, "grand", "Grand", Some("child"));

        let ids = collect_folder_subtree_ids(&conn, "root").unwrap();
        let mut sorted = ids;
        sorted.sort();
        assert_eq!(
            sorted,
            vec!["child".to_string(), "grand".to_string(), "root".to_string()]
        );
    }
}
