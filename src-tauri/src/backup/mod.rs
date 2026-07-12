use crate::db::DbState;
use crate::storage;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

const MANIFEST_NAME: &str = "manifest.json";
const DB_NAME: &str = "scribe.db";
const DOCUMENTS_PREFIX: &str = "documents/";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    version: String,
    schema_version: i32,
    created_at: i64,
    documents_dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupExportResult {
    pub path: String,
    pub documents_included: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupImportResult {
    pub documents_imported: u32,
    pub message: String,
}

fn checkpoint_wal(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| e.to_string())
}

fn add_dir_to_zip(
    zip: &mut ZipWriter<File>,
    base: &Path,
    prefix: &str,
    options: SimpleFileOptions,
) -> Result<u32, String> {
    let mut count = 0u32;
    if !base.exists() {
        return Ok(0);
    }

    for entry in walkdir_light(base)? {
        let path = entry;
        let rel = path
            .strip_prefix(base)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let name = format!("{prefix}{rel}");

        if path.is_dir() {
            continue;
        }

        zip.start_file(name, options).map_err(|e| e.to_string())?;
        let mut file = File::open(&path).map_err(|e| e.to_string())?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        zip.write_all(&buffer).map_err(|e| e.to_string())?;
        count += 1;
    }

    Ok(count)
}

fn walkdir_light(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut stack = vec![root.to_path_buf()];
    let mut files = Vec::new();

    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else {
                files.push(path);
            }
        }
    }

    Ok(files)
}

#[tauri::command]
pub async fn export_library_archive(
    app: AppHandle,
    state: tauri::State<'_, DbState>,
) -> Result<Option<BackupExportResult>, String> {
    let _ = crate::commands::storage::flush_document_persist(&state.persist_queue, None);

    let (db_path, documents_dir, schema_version) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        checkpoint_wal(&conn)?;
        let schema_version: i32 = conn
            .query_row(
                "SELECT value FROM meta WHERE key = 'schema_version'",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        let app_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
        let db_path = app_dir.join(DB_NAME);
        let documents_dir = storage::get_documents_dir(&app, &conn)?;
        (db_path, documents_dir, schema_version)
    };

    let save_path = app
        .dialog()
        .file()
        .set_title("Exportovať zálohu knižnice")
        .add_filter("Scribe archive", &["scribe-backup.zip"])
        .set_file_name(&format!(
            "scribe-backup-{}.zip",
            chrono::Utc::now().format("%Y%m%d-%H%M%S")
        ))
        .blocking_save_file();

    let Some(save_path) = save_path else {
        return Ok(None);
    };

    let out_path = PathBuf::from(save_path.to_string());
    let file = File::create(&out_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let manifest = BackupManifest {
        version: env!("CARGO_PKG_VERSION").to_string(),
        schema_version,
        created_at: chrono::Utc::now().timestamp(),
        documents_dir: documents_dir.to_string_lossy().to_string(),
    };
    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    zip.start_file(MANIFEST_NAME, options)
        .map_err(|e| e.to_string())?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|e| e.to_string())?;

    zip.start_file(DB_NAME, options).map_err(|e| e.to_string())?;
    let mut db_file = File::open(&db_path).map_err(|e| e.to_string())?;
    let mut db_bytes = Vec::new();
    db_file.read_to_end(&mut db_bytes).map_err(|e| e.to_string())?;
    zip.write_all(&db_bytes).map_err(|e| e.to_string())?;

    let documents_included = add_dir_to_zip(&mut zip, &documents_dir, DOCUMENTS_PREFIX, options)?;

    zip.finish().map_err(|e| e.to_string())?;

    Ok(Some(BackupExportResult {
        path: out_path.to_string_lossy().to_string(),
        documents_included,
    }))
}

#[tauri::command]
pub async fn import_library_archive(
    app: AppHandle,
    state: tauri::State<'_, DbState>,
) -> Result<Option<BackupImportResult>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Importovať zálohu knižnice")
        .add_filter("Scribe archive", &["scribe-backup.zip", "zip"])
        .blocking_pick_file();

    let Some(picked) = picked else {
        return Ok(None);
    };

    let archive_path = PathBuf::from(picked.to_string());
    let file = File::open(&archive_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut manifest: Option<BackupManifest> = None;
    let mut db_bytes: Option<Vec<u8>> = None;
    let mut document_files: Vec<(String, Vec<u8>)> = Vec::new();

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

        if name == MANIFEST_NAME {
            manifest = Some(serde_json::from_slice(&buffer).map_err(|e| e.to_string())?);
        } else if name == DB_NAME {
            db_bytes = Some(buffer);
        } else if name.starts_with(DOCUMENTS_PREFIX) && !name.ends_with('/') {
            document_files.push((name, buffer));
        }
    }

    let manifest = manifest.ok_or_else(|| "Archív neobsahuje manifest.json".to_string())?;
    let db_bytes = db_bytes.ok_or_else(|| "Archív neobsahuje scribe.db".to_string())?;

    let _ = crate::commands::storage::flush_document_persist(&state.persist_queue, None);

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    let db_path = app_dir.join(DB_NAME);

    if db_path.exists() {
        let backup = app_dir.join(format!(
            "scribe.db.bak-{}",
            chrono::Utc::now().timestamp()
        ));
        fs::rename(&db_path, &backup).map_err(|e| e.to_string())?;
    }

    fs::write(&db_path, &db_bytes).map_err(|e| e.to_string())?;

    let documents_dir = {
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        storage::get_documents_dir(&app, &conn)?
    };

    if documents_dir.exists() {
        let backup_dir = documents_dir.with_extension(format!(
            "bak-{}",
            chrono::Utc::now().timestamp()
        ));
        let _ = fs::rename(&documents_dir, &backup_dir);
    }
    fs::create_dir_all(&documents_dir).map_err(|e| e.to_string())?;

    let documents_imported = document_files.len() as u32;

    for (name, bytes) in document_files {
        let rel = name.strip_prefix(DOCUMENTS_PREFIX).unwrap_or(&name);
        let target = documents_dir.join(rel);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&target, &bytes).map_err(|e| e.to_string())?;
    }

    {
        let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
        *conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;",
        )
        .map_err(|e| e.to_string())?;
        storage::reconcile_storage(&app, &conn)?;
    }

    Ok(Some(BackupImportResult {
        documents_imported,
        message: format!(
            "Obnovená záloha Scribe {} (schéma v{})",
            manifest.version, manifest.schema_version
        ),
    }))
}
