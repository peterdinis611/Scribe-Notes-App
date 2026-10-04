//! Folder commands.
//!
//! Required migration (run once, e.g. in your db migrations):
//!
//! ```sql
//! ALTER TABLE folders ADD COLUMN color       TEXT;
//! ALTER TABLE folders ADD COLUMN icon        TEXT;
//! ALTER TABLE folders ADD COLUMN sort_order  INTEGER NOT NULL DEFAULT 0;
//! ALTER TABLE folders ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
//! ```
//!
//! New commands to register in `tauri::generate_handler![...]`:
//! `set_folder_appearance`, `set_folder_archived`, `reorder_folders`,
//! `duplicate_folder_structure`, `folder_stats`, `folder_document_counts`.

use crate::commands::documents::soft_delete_document_row;
use crate::db::DbState;
use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, State};
use uuid::Uuid;

const FOLDER_COLS: &str = "id, name, parent_id, created_at, updated_at, COALESCE(is_pinned, 0), \
     COALESCE(is_vault, 0), vault_verifier, color, icon, COALESCE(sort_order, 0), \
     COALESCE(is_archived, 0)";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub is_pinned: bool,
    pub is_vault: bool,
    pub vault_verifier: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub sort_order: i64,
    pub is_archived: bool,
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
        is_pinned: row.get::<_, i64>(5).unwrap_or(0) != 0,
        is_vault: row.get::<_, i64>(6).unwrap_or(0) != 0,
        vault_verifier: row.get(7)?,
        color: row.get(8)?,
        icon: row.get(9)?,
        sort_order: row.get::<_, i64>(10).unwrap_or(0),
        is_archived: row.get::<_, i64>(11).unwrap_or(0) != 0,
    })
}

fn get_folder(conn: &Connection, id: &str) -> Result<Folder, String> {
    conn.query_row(
        &format!("SELECT {FOLDER_COLS} FROM folders WHERE id = ?1"),
        params![id],
        map_folder,
    )
    .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn placeholders(n: usize) -> String {
    std::iter::repeat("?").take(n).collect::<Vec<_>>().join(", ")
}

fn text_values(ids: &[String]) -> Vec<Value> {
    ids.iter().map(|s| Value::Text(s.clone())).collect()
}

/// Runs `f` inside BEGIN IMMEDIATE / COMMIT, rolling back on error.
fn with_tx<T>(conn: &Connection, f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    conn.execute("BEGIN IMMEDIATE", [])
        .map_err(|e| e.to_string())?;
    match f() {
        Ok(value) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            Ok(value)
        }
        Err(err) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(err)
        }
    }
}

/// Accepts `#RGB`-less, strict `#RRGGBB`. Empty string clears the color.
fn normalize_color(color: Option<String>) -> Result<Option<String>, String> {
    let Some(raw) = color else { return Ok(None) };
    let c = raw.trim();
    if c.is_empty() {
        return Ok(None);
    }
    let valid = c.len() == 7
        && c.starts_with('#')
        && c[1..].chars().all(|ch| ch.is_ascii_hexdigit());
    if !valid {
        return Err("Farba musí byť vo formáte #RRGGBB".to_string());
    }
    Ok(Some(c.to_lowercase()))
}

/// Icon is an emoji or a short icon name chosen by the frontend.
fn normalize_icon(icon: Option<String>) -> Result<Option<String>, String> {
    let Some(raw) = icon else { return Ok(None) };
    let i = raw.trim();
    if i.is_empty() {
        return Ok(None);
    }
    if i.chars().count() > 32 {
        return Err("Ikona môže mať najviac 32 znakov".to_string());
    }
    Ok(Some(i.to_string()))
}

fn sibling_name_taken(
    conn: &Connection,
    parent_id: Option<&str>,
    name: &str,
    exclude_id: &str,
) -> Result<bool, String> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM folders \
             WHERE library_id = ?1 AND parent_id IS ?2 AND name = ?3 COLLATE NOCASE AND id != ?4 \
             LIMIT 1",
            params![
                crate::libraries::active_library_id(conn),
                parent_id,
                name,
                exclude_id
            ],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(found.is_some())
}

// ---------------------------------------------------------------------------
// List / create / rename
// ---------------------------------------------------------------------------

/// `include_archived` defaults to false, so existing frontend calls keep working.
#[tauri::command]
pub fn list_folders(
    state: State<'_, DbState>,
    include_archived: Option<bool>,
) -> Result<Vec<Folder>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let library_id = crate::libraries::active_library_id(&conn);
    let include_archived = include_archived.unwrap_or(false);

    let sql = format!(
        "SELECT {FOLDER_COLS} FROM folders \
         WHERE library_id = ?1 AND (?2 = 1 OR COALESCE(is_archived, 0) = 0) \
         ORDER BY COALESCE(sort_order, 0) ASC, name COLLATE NOCASE ASC"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![library_id, if include_archived { 1 } else { 0 }], map_folder)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderInput {
    pub name: String,
    pub parent_id: Option<String>,
    pub is_vault: Option<bool>,
    pub vault_verifier: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
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
    let is_vault = input.is_vault.unwrap_or(false);
    if is_vault && input.vault_verifier.as_ref().map(|v| v.trim().is_empty()).unwrap_or(true) {
        return Err("Vault folder requires a password verifier".to_string());
    }
    if sibling_name_taken(&conn, input.parent_id.as_deref(), name, &id)? {
        return Err("Priečinok s týmto názvom už na tejto úrovni existuje".to_string());
    }
    let color = normalize_color(input.color)?;
    let icon = normalize_icon(input.icon)?;

    // New folders go to the end of their level.
    let next_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM folders \
             WHERE library_id = ?1 AND parent_id IS ?2",
            params![crate::libraries::active_library_id(&conn), input.parent_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO folders \
         (id, name, parent_id, created_at, updated_at, is_vault, vault_verifier, library_id, \
          color, icon, sort_order) \
         VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            id,
            name,
            input.parent_id,
            now,
            if is_vault { 1 } else { 0 },
            input.vault_verifier,
            crate::libraries::active_library_id(&conn),
            color,
            icon,
            next_order
        ],
    )
    .map_err(|e| e.to_string())?;

    get_folder(&conn, &id)
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
    let current = get_folder(&conn, &input.id)?;
    if sibling_name_taken(&conn, current.parent_id.as_deref(), name, &input.id)? {
        return Err("Priečinok s týmto názvom už na tejto úrovni existuje".to_string());
    }

    conn.execute(
        "UPDATE folders SET name = ?1, updated_at = ?2 WHERE id = ?3",
        params![name, now_ts(), input.id],
    )
    .map_err(|e| e.to_string())?;

    get_folder(&conn, &input.id)
}

// ---------------------------------------------------------------------------
// New options: appearance, archive, ordering
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetFolderAppearanceInput {
    pub id: String,
    /// `null` or empty string clears the color.
    pub color: Option<String>,
    /// `null` or empty string clears the icon.
    pub icon: Option<String>,
}

#[tauri::command]
pub fn set_folder_appearance(
    state: State<'_, DbState>,
    input: SetFolderAppearanceInput,
) -> Result<Folder, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let color = normalize_color(input.color)?;
    let icon = normalize_icon(input.icon)?;

    let changed = conn
        .execute(
            "UPDATE folders SET color = ?1, icon = ?2, updated_at = ?3 WHERE id = ?4",
            params![color, icon, now_ts(), input.id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Priečinok neexistuje".to_string());
    }
    get_folder(&conn, &input.id)
}

/// Archives (or restores) a folder together with all its subfolders.
/// Returns the ids that were changed.
#[tauri::command]
pub fn set_folder_archived(
    state: State<'_, DbState>,
    id: String,
    archived: bool,
) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let folder_ids = collect_folder_subtree_ids(&conn, &id)?;
    if folder_ids.is_empty() {
        return Err("Priečinok neexistuje".to_string());
    }

    let sql = format!(
        "UPDATE folders SET is_archived = ?, updated_at = ? WHERE id IN ({})",
        placeholders(folder_ids.len())
    );
    let mut values = vec![
        Value::Integer(if archived { 1 } else { 0 }),
        Value::Integer(now_ts()),
    ];
    values.extend(text_values(&folder_ids));

    conn.execute(&sql, params_from_iter(values))
        .map_err(|e| e.to_string())?;
    Ok(folder_ids)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderFoldersInput {
    /// Sibling folder ids in the desired order.
    pub ordered_ids: Vec<String>,
}

#[tauri::command]
pub fn reorder_folders(
    state: State<'_, DbState>,
    input: ReorderFoldersInput,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let library_id = crate::libraries::active_library_id(&conn);

    with_tx(&conn, || {
        for (index, id) in input.ordered_ids.iter().enumerate() {
            conn.execute(
                "UPDATE folders SET sort_order = ?1 WHERE id = ?2 AND library_id = ?3",
                params![index as i64, id, library_id],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    })
}

// ---------------------------------------------------------------------------
// New options: stats and duplication
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderStats {
    pub subfolder_count: usize,
    pub document_count: usize,
}

/// Counts for a folder including everything nested below it.
#[tauri::command]
pub fn folder_stats(state: State<'_, DbState>, id: String) -> Result<FolderStats, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let folder_ids = collect_folder_subtree_ids(&conn, &id)?;
    if folder_ids.is_empty() {
        return Err("Priečinok neexistuje".to_string());
    }
    let document_ids = collect_document_ids_in_folders(&conn, &folder_ids)?;
    Ok(FolderStats {
        subfolder_count: folder_ids.len() - 1,
        document_count: document_ids.len(),
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderDocumentCount {
    pub folder_id: String,
    pub count: i64,
}

/// Direct (non-recursive) document counts for every folder, for sidebar badges.
#[tauri::command]
pub fn folder_document_counts(
    state: State<'_, DbState>,
) -> Result<Vec<FolderDocumentCount>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let library_id = crate::libraries::active_library_id(&conn);
    let mut stmt = conn
        .prepare(
            "SELECT folder_id, COUNT(*) FROM documents \
             WHERE deleted_at IS NULL AND library_id = ?1 AND folder_id IS NOT NULL \
             GROUP BY folder_id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([library_id], |row| {
            Ok(FolderDocumentCount {
                folder_id: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Copies a folder and all its subfolders (structure, color, icon) without documents.
/// Vault folders cannot be duplicated because the verifier belongs to the original.
/// Returns the new folders, root first.
#[tauri::command]
pub fn duplicate_folder_structure(
    state: State<'_, DbState>,
    id: String,
) -> Result<Vec<Folder>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let library_id = crate::libraries::active_library_id(&conn);

    // Recursive CTE without ORDER BY is processed FIFO, so parents precede children.
    let source_ids = collect_folder_subtree_ids(&conn, &id)?;
    if source_ids.is_empty() {
        return Err("Priečinok neexistuje".to_string());
    }

    with_tx(&conn, || {
        let now = now_ts();
        let mut id_map: HashMap<String, String> = HashMap::new();
        let mut created = Vec::with_capacity(source_ids.len());

        for old_id in &source_ids {
            let old = get_folder(&conn, old_id)?;
            if old.is_vault {
                return Err("Vault priečinok nie je možné duplikovať".to_string());
            }
            let new_id = Uuid::new_v4().to_string();
            let is_root = old_id == &id;

            let parent_id = if is_root {
                old.parent_id.clone()
            } else {
                old.parent_id.as_ref().and_then(|p| id_map.get(p).cloned())
            };
            let name = if is_root {
                let mut candidate = format!("{} (kópia)", old.name);
                let mut n = 2;
                while sibling_name_taken(&conn, parent_id.as_deref(), &candidate, &new_id)? {
                    candidate = format!("{} (kópia {})", old.name, n);
                    n += 1;
                }
                candidate
            } else {
                old.name.clone()
            };

            conn.execute(
                "INSERT INTO folders \
                 (id, name, parent_id, created_at, updated_at, library_id, color, icon, sort_order) \
                 VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6, ?7, ?8)",
                params![
                    new_id,
                    name,
                    parent_id,
                    now,
                    library_id,
                    old.color,
                    old.icon,
                    old.sort_order
                ],
            )
            .map_err(|e| e.to_string())?;

            id_map.insert(old_id.clone(), new_id.clone());
            created.push(get_folder(&conn, &new_id)?);
        }
        Ok(created)
    })
}

// ---------------------------------------------------------------------------
// Delete / trash
// ---------------------------------------------------------------------------

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

    let sql = format!(
        "SELECT id FROM documents WHERE folder_id IN ({}) AND deleted_at IS NULL",
        placeholders(folder_ids.len())
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(folder_ids.iter()), |row| row.get(0))
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

/// Soft-deletes documents in the whole subtree and removes every folder in it
/// (previously only the root row was deleted, which could leave orphaned children).
#[tauri::command]
pub fn delete_folder(
    _app: AppHandle,
    state: State<'_, DbState>,
    id: String,
) -> Result<DeleteFolderResult, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    with_tx(&conn, || {
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

        let sql = format!(
            "DELETE FROM folders WHERE id IN ({})",
            placeholders(folder_ids.len())
        );
        conn.execute(&sql, params_from_iter(folder_ids.iter()))
            .map_err(|e| e.to_string())?;

        Ok(DeleteFolderResult {
            deleted_document_ids,
            deleted_folder_ids: folder_ids,
        })
    })
}

// ---------------------------------------------------------------------------
// Move / pin
// ---------------------------------------------------------------------------

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

    let current = get_folder(&conn, &input.id)?;

    if let Some(parent_id) = input.parent_id.as_deref() {
        if parent_id == input.id {
            return Err("Priečinok nemôže byť presunutý do seba".to_string());
        }
        // Moving a folder into one of its own descendants would create a cycle.
        let subtree = collect_folder_subtree_ids(&conn, &input.id)?;
        if subtree.iter().any(|s| s == parent_id) {
            return Err("Priečinok nemôže byť presunutý do vlastného podpriečinka".to_string());
        }
        let parent_exists: Option<String> = conn
            .query_row(
                "SELECT id FROM folders WHERE id = ?1",
                params![parent_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if parent_exists.is_none() {
            return Err("Cieľový priečinok neexistuje".to_string());
        }
    }

    if sibling_name_taken(&conn, input.parent_id.as_deref(), &current.name, &input.id)? {
        return Err("V cieľovom priečinku už existuje priečinok s rovnakým názvom".to_string());
    }

    conn.execute(
        "UPDATE folders SET parent_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![input.parent_id, now, input.id],
    )
    .map_err(|e| e.to_string())?;

    get_folder(&conn, &input.id)
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveDocumentsInput {
    pub document_ids: Vec<String>,
    pub folder_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveDocumentsResult {
    pub moved_ids: Vec<String>,
}

/// Atomic bulk move for library multi-select.
#[tauri::command]
pub fn move_documents_to_folder(
    state: State<'_, DbState>,
    input: MoveDocumentsInput,
) -> Result<MoveDocumentsResult, String> {
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

    let ids: Vec<String> = input
        .document_ids
        .into_iter()
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect();
    if ids.is_empty() {
        return Ok(MoveDocumentsResult {
            moved_ids: Vec::new(),
        });
    }

    with_tx(&conn, || {
        let sql = format!(
            "UPDATE documents SET folder_id = ?, updated_at = ? \
             WHERE deleted_at IS NULL AND id IN ({})",
            placeholders(ids.len())
        );
        let mut values = vec![
            match &input.folder_id {
                Some(id) => Value::Text(id.clone()),
                None => Value::Null,
            },
            Value::Integer(now),
        ];
        values.extend(text_values(&ids));
        conn.execute(&sql, params_from_iter(values))
            .map_err(|e| e.to_string())?;
        Ok(MoveDocumentsResult { moved_ids: ids })
    })
}

#[tauri::command]
pub fn set_folder_pinned(
    state: State<'_, DbState>,
    id: String,
    pinned: bool,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE folders SET is_pinned = ?1, updated_at = ?2 WHERE id = ?3",
        params![if pinned { 1 } else { 0 }, now_ts(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn default_folder_id(conn: &rusqlite::Connection) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT id FROM folders WHERE library_id = ?1 ORDER BY created_at ASC LIMIT 1",
        [crate::libraries::active_library_id(conn)],
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

    #[test]
    fn subtree_of_folder_contains_its_descendant_so_move_would_cycle() {
        let conn = in_memory_conn();
        seed_folder(&conn, "root", "Root", None);
        seed_folder(&conn, "child", "Child", Some("root"));

        let subtree = collect_folder_subtree_ids(&conn, "root").unwrap();
        assert!(subtree.iter().any(|s| s == "child"));
    }

    #[test]
    fn normalize_color_accepts_hex_and_rejects_garbage() {
        assert_eq!(
            normalize_color(Some(" #0F766E ".into())).unwrap(),
            Some("#0f766e".to_string())
        );
        assert_eq!(normalize_color(Some("".into())).unwrap(), None);
        assert_eq!(normalize_color(None).unwrap(), None);
        assert!(normalize_color(Some("red".into())).is_err());
        assert!(normalize_color(Some("#12345".into())).is_err());
        assert!(normalize_color(Some("#12345g".into())).is_err());
    }

    #[test]
    fn normalize_icon_limits_length() {
        assert_eq!(normalize_icon(Some("📁".into())).unwrap(), Some("📁".to_string()));
        assert!(normalize_icon(Some("x".repeat(33))).is_err());
    }
}