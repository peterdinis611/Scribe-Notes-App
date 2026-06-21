use rusqlite::{params, Connection, OptionalExtension};
use tauri::AppHandle;

use super::{collect_scribe_files, get_documents_dir, read_scribe_file, write_document_file_if_changed, DiskDocument};

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileResult {
    pub scanned_count: u32,
    pub imported_count: u32,
    pub updated_from_disk_count: u32,
    pub synced_to_disk_count: u32,
}

pub fn reconcile_storage(app: &AppHandle, conn: &Connection) -> Result<ReconcileResult, String> {
    let dir = get_documents_dir(app, conn)?;
    let mut paths = Vec::new();
    collect_scribe_files(&dir, &mut paths)?;

    let mut result = ReconcileResult {
        scanned_count: 0,
        imported_count: 0,
        updated_from_disk_count: 0,
        synced_to_disk_count: 0,
    };

    conn.execute("BEGIN IMMEDIATE", [])
        .map_err(|error| error.to_string())?;

    let import_result = (|| -> Result<(), String> {
        for path in paths {
            result.scanned_count += 1;

            let Ok(disk) = read_scribe_file(&path) else {
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
                .map_err(|error| error.to_string())?;

            match existing {
                None => {
                    conn.execute(
                        "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6)",
                        params![
                            disk.id,
                            disk.title,
                            disk.content_json,
                            path_str,
                            disk.created_at,
                            disk.updated_at
                        ],
                    )
                    .map_err(|error| error.to_string())?;
                    crate::db::sync_document_fts(&conn, &disk.id, &disk.title, &disk.content_json)?;
                    result.imported_count += 1;
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
                    .map_err(|error| error.to_string())?;
                    crate::db::sync_document_fts(&conn, &disk.id, &disk.title, &disk.content_json)?;
                    result.updated_from_disk_count += 1;
                }
                Some((_, _)) => {
                    conn.execute(
                        "UPDATE documents SET file_path = ?1 WHERE id = ?2 AND (file_path IS NULL OR file_path = '')",
                        params![path_str, disk.id],
                    )
                    .map_err(|error| error.to_string())?;
                }
            }
        }

        Ok(())
    })();

    if let Err(error) = import_result {
        let _ = conn.execute("ROLLBACK", []);
        return Err(error);
    }

    let sync_result = (|| -> Result<(), String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, content_json, created_at, updated_at, file_path FROM documents",
            )
            .map_err(|error| error.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            })
            .map_err(|error| error.to_string())?;

        for row in rows {
            let (id, title, content_json, created_at, updated_at, file_path) =
                row.map_err(|error| error.to_string())?;

            if super::document_file_is_current(file_path.as_deref(), updated_at, &content_json)? {
                continue;
            }

            let disk_doc = DiskDocument {
                version: 1,
                id: id.clone(),
                title,
                content_json,
                created_at,
                updated_at,
            };

            if let Some(path) =
                write_document_file_if_changed(&dir, &disk_doc, file_path.as_deref())?
            {
                result.synced_to_disk_count += 1;
                let path_str = path.to_string_lossy().to_string();
                if file_path.as_deref() != Some(path_str.as_str()) {
                    conn.execute(
                        "UPDATE documents SET file_path = ?1 WHERE id = ?2",
                        params![path_str, id],
                    )
                    .map_err(|error| error.to_string())?;
                }
            }
        }

        Ok(())
    })();

    if let Err(error) = sync_result {
        let _ = conn.execute("ROLLBACK", []);
        return Err(error);
    }

    conn.execute("COMMIT", [])
        .map_err(|error| error.to_string())?;

    Ok(result)
}
