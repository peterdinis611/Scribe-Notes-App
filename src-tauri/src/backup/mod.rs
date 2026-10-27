use crate::db::DbState;
use crate::security::safe_join_under;
use crate::storage;
use rusqlite::Connection;
use scribe_core::db::remap_library_video_paths;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use zip::write::{FileOptions, SimpleFileOptions};
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const MANIFEST_NAME: &str = "manifest.json";
const DB_NAME: &str = "scribe.db";
const DOCUMENTS_PREFIX: &str = "documents/";
const BACKUP_FILE_PREFIX: &str = "scribe-backup-";
const BACKUP_FILE_SUFFIX: &str = ".zip";
/// Keep the newest N automatic zip backups in a folder.
const AUTO_BACKUP_KEEP: usize = 14;

/// Default automatic backup folder: ~/Documents/Scribe/Backups
pub fn default_auto_backup_dir() -> PathBuf {
    storage::default_documents_dir().join("Backups")
}

fn is_auto_backup_zip(name: &str) -> bool {
    name.starts_with(BACKUP_FILE_PREFIX) && name.ends_with(BACKUP_FILE_SUFFIX)
}

/// Delete older `scribe-backup-*.zip` files, keeping the newest `keep` archives.
pub fn prune_old_auto_backups(dir: &Path, keep: usize) -> Result<u32, String> {
    if keep == 0 || !dir.is_dir() {
        return Ok(0);
    }

    let mut archives: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !path.is_file() || !is_auto_backup_zip(name) {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        archives.push((path, modified));
    }

    archives.sort_by(|a, b| b.1.cmp(&a.1));
    let mut removed = 0u32;
    for (path, _) in archives.into_iter().skip(keep) {
        if fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

fn resolve_auto_backup_dir(directory: &str) -> Result<PathBuf, String> {
    let trimmed = directory.trim();
    let dir = if trimmed.is_empty() {
        default_auto_backup_dir()
    } else {
        PathBuf::from(trimmed)
    };
    fs::create_dir_all(&dir).map_err(|e| format!("Nepodarilo sa vytvoriť priečinok záloh: {e}"))?;
    Ok(dir)
}

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
    /// Copied library videos whose absolute `source_path` was rewritten under the restored documents dir.
    #[serde(default)]
    pub videos_remapped: u32,
    pub message: String,
}

fn checkpoint_wal(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| e.to_string())
}

/// Already-compressed / binary media — store without deflate (CPU + size win).
fn compression_for_path(path: &Path) -> CompressionMethod {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some(
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "avif" | "heic" | "heif" | "bmp" | "ico"
            | "mp4" | "mov" | "m4v" | "webm" | "mkv" | "avi" | "mp3" | "m4a" | "aac" | "ogg"
            | "opus" | "flac" | "wav" | "zip" | "gz" | "bz2" | "xz" | "7z" | "rar" | "pdf"
            | "docx" | "xlsx" | "pptx" | "pages" | "numbers" | "key" | "wasm" | "woff" | "woff2",
        ) => CompressionMethod::Stored,
        _ => CompressionMethod::Deflated,
    }
}

fn stream_path_into_zip<W: Write + io::Seek>(
    zip: &mut ZipWriter<W>,
    path: &Path,
    name: &str,
    password: Option<&str>,
) -> Result<(), String> {
    let method = if name == DB_NAME || name == MANIFEST_NAME {
        CompressionMethod::Deflated
    } else {
        compression_for_path(path)
    };
    let options = archive_file_options_with_method(password, method);
    zip.start_file(name, options).map_err(|e| e.to_string())?;
    let mut reader = BufReader::with_capacity(64 * 1024, File::open(path).map_err(|e| e.to_string())?);
    io::copy(&mut reader, zip).map_err(|e| e.to_string())?;
    Ok(())
}

fn add_dir_to_zip<W: Write + io::Seek>(
    zip: &mut ZipWriter<W>,
    base: &Path,
    prefix: &str,
    password: Option<&str>,
) -> Result<u32, String> {
    let mut count = 0u32;
    if !base.exists() {
        return Ok(0);
    }

    for path in walkdir_light(base)? {
        if path.is_dir() {
            continue;
        }
        let rel = path
            .strip_prefix(base)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let name = format!("{prefix}{rel}");
        stream_path_into_zip(zip, &path, &name, password)?;
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

fn archive_file_options_with_method(
    password: Option<&str>,
    method: CompressionMethod,
) -> FileOptions<'_, '_, ()> {
    let base = SimpleFileOptions::default().compression_method(method);
    match password.map(str::trim).filter(|p| !p.is_empty()) {
        Some(pw) => base.with_aes_encryption(zip::AesMode::Aes256, pw),
        None => base,
    }
}

fn write_library_archive(
    out_path: &Path,
    db_path: &Path,
    documents_dir: &Path,
    schema_version: i32,
    password: Option<&str>,
) -> Result<BackupExportResult, String> {
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let file = BufWriter::with_capacity(256 * 1024, File::create(out_path).map_err(|e| e.to_string())?);
    let mut zip = ZipWriter::new(file);
    let options = archive_file_options_with_method(password, CompressionMethod::Deflated);

    let manifest = BackupManifest {
        version: env!("CARGO_PKG_VERSION").to_string(),
        schema_version,
        created_at: chrono::Utc::now().timestamp(),
        documents_dir: documents_dir.to_string_lossy().to_string(),
    };
    let manifest_json = serde_json::to_vec(&manifest).map_err(|e| e.to_string())?;
    zip.start_file(MANIFEST_NAME, options)
        .map_err(|e| e.to_string())?;
    zip.write_all(&manifest_json).map_err(|e| e.to_string())?;

    stream_path_into_zip(&mut zip, db_path, DB_NAME, password)?;

    let documents_included = add_dir_to_zip(&mut zip, documents_dir, DOCUMENTS_PREFIX, password)?;

    let mut file = zip.finish().map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;

    Ok(BackupExportResult {
        path: out_path.to_string_lossy().to_string(),
        documents_included,
    })
}

fn prepare_backup_paths(
    app: &AppHandle,
    state: &DbState,
) -> Result<(PathBuf, PathBuf, i32), String> {
    let _ = crate::commands::storage::flush_document_persist(&state.persist_queue, None);
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
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join(DB_NAME);
    let documents_dir = storage::get_documents_dir(app, &conn)?;
    Ok((db_path, documents_dir, schema_version))
}

#[tauri::command]
pub async fn export_library_archive(
    app: AppHandle,
    state: tauri::State<'_, DbState>,
    password: Option<String>,
) -> Result<Option<BackupExportResult>, String> {
    let (db_path, documents_dir, schema_version) = prepare_backup_paths(&app, &state)?;
    let pw = password
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(str::to_owned);
    let file_name = format!(
        "scribe-backup-{}.zip",
        chrono::Utc::now().format("%Y%m%d-%H%M%S")
    );

    tauri::async_runtime::spawn_blocking(move || {
        let save_path = app
            .dialog()
            .file()
            .set_title("Exportovať zálohu knižnice")
            .add_filter("Scribe archive", &["scribe-backup.zip"])
            .set_file_name(&file_name)
            .blocking_save_file();

        let Some(save_path) = save_path else {
            return Ok(None);
        };

        let out_path = PathBuf::from(save_path.to_string());
        Ok(Some(write_library_archive(
            &out_path,
            &db_path,
            &documents_dir,
            schema_version,
            pw.as_deref(),
        )?))
    })
    .await
    .map_err(|e| format!("Backup worker zlyhal: {e}"))?
}

#[tauri::command]
pub fn get_default_auto_backup_dir() -> Result<String, String> {
    let dir = default_auto_backup_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Nepodarilo sa vytvoriť priečinok záloh: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn export_library_archive_to_dir(
    app: AppHandle,
    state: tauri::State<'_, DbState>,
    directory: String,
) -> Result<BackupExportResult, String> {
    let dir = resolve_auto_backup_dir(&directory)?;

    let (db_path, documents_dir, schema_version) = prepare_backup_paths(&app, &state)?;
    let out_path = dir.join(format!(
        "{BACKUP_FILE_PREFIX}{}.zip",
        chrono::Utc::now().format("%Y%m%d-%H%M%S")
    ));
    let password = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        auto_backup_password(&conn)
    };

    tauri::async_runtime::spawn_blocking(move || {
        let result = write_library_archive(
            &out_path,
            &db_path,
            &documents_dir,
            schema_version,
            password.as_deref(),
        )?;
        let _ = prune_old_auto_backups(&dir, AUTO_BACKUP_KEEP);
        Ok(result)
    })
    .await
    .map_err(|e| format!("Backup worker zlyhal: {e}"))?
}

fn open_archive_entry<'a>(
    archive: &'a mut ZipArchive<File>,
    index: usize,
    password: Option<&[u8]>,
) -> Result<zip::read::ZipFile<'a, File>, String> {
    match password {
        Some(pw) => archive
            .by_index_decrypt(index, pw)
            .map_err(|e| format!("Nepodarilo sa otvoriť súbor v archíve (heslo?): {e}")),
        None => archive.by_index(index).map_err(|e| {
            if format!("{e}").to_lowercase().contains("encrypt") {
                "Archív je šifrovaný — zadajte heslo.".to_string()
            } else {
                e.to_string()
            }
        }),
    }
}

/// Extract archive to disk without holding every document in RAM.
fn extract_library_archive(
    archive_path: &Path,
    app_dir: &Path,
    documents_dir_hint: &Path,
    password: Option<&str>,
) -> Result<(BackupManifest, PathBuf, PathBuf, u32), String> {
    let file = File::open(archive_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    let pw_bytes = password
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(|p| p.as_bytes());

    fs::create_dir_all(app_dir).map_err(|e| e.to_string())?;
    let db_path = app_dir.join(DB_NAME);
    let db_staging = app_dir.join(format!(
        "scribe.db.import-{}",
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
    ));

    let mut manifest: Option<BackupManifest> = None;
    let mut saw_db = false;
    let staging_docs = app_dir.join(format!(
        "documents-import-{}",
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
    ));
    fs::create_dir_all(&staging_docs).map_err(|e| e.to_string())?;
    let mut documents_imported = 0u32;

    for i in 0..archive.len() {
        let mut entry = open_archive_entry(&mut archive, i, pw_bytes)?;
        let name = entry.name().map_err(|e| e.to_string())?.into_owned();

        if name == MANIFEST_NAME {
            let mut buffer = Vec::with_capacity(entry.size() as usize);
            entry.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
            manifest = Some(serde_json::from_slice(&buffer).map_err(|e| e.to_string())?);
            continue;
        }

        if name == DB_NAME {
            let mut out = BufWriter::with_capacity(
                256 * 1024,
                File::create(&db_staging).map_err(|e| e.to_string())?,
            );
            io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            out.flush().map_err(|e| e.to_string())?;
            saw_db = true;
            continue;
        }

        if name.starts_with(DOCUMENTS_PREFIX) && !name.ends_with('/') {
            let rel = name.strip_prefix(DOCUMENTS_PREFIX).unwrap_or(&name);
            let target = safe_join_under(&staging_docs, rel)?;
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out =
                BufWriter::with_capacity(64 * 1024, File::create(&target).map_err(|e| e.to_string())?);
            io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            out.flush().map_err(|e| e.to_string())?;
            documents_imported += 1;
        }
    }

    let manifest = manifest.ok_or_else(|| "Archív neobsahuje manifest.json".to_string())?;
    if !saw_db {
        let _ = fs::remove_file(&db_staging);
        let _ = fs::remove_dir_all(&staging_docs);
        return Err("Archív neobsahuje scribe.db".to_string());
    }

    if db_path.exists() {
        let backup = app_dir.join(format!(
            "scribe.db.bak-{}",
            chrono::Utc::now().timestamp()
        ));
        fs::rename(&db_path, &backup).map_err(|e| e.to_string())?;
    }
    fs::rename(&db_staging, &db_path).map_err(|e| e.to_string())?;

    // Prefer documents dir stored in the restored DB; fall back to caller hint.
    let documents_dir = {
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        let stored: Option<String> = conn
            .query_row(
                "SELECT value FROM meta WHERE key = ?1",
                [storage::META_DOCUMENTS_DIR],
                |row| row.get(0),
            )
            .ok();
        stored
            .filter(|v| !v.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| documents_dir_hint.to_path_buf())
    };

    if documents_dir.exists() {
        let backup_dir = documents_dir.with_extension(format!(
            "bak-{}",
            chrono::Utc::now().timestamp()
        ));
        let _ = fs::rename(&documents_dir, &backup_dir);
    }
    if let Some(parent) = documents_dir.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&staging_docs, &documents_dir).map_err(|e| e.to_string())?;

    // Point meta at the directory we actually restored into (hint or stored).
    {
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        storage::set_documents_dir(&conn, &documents_dir)?;
    }

    Ok((manifest, db_path, documents_dir, documents_imported))
}

#[tauri::command]
pub async fn import_library_archive(
    app: AppHandle,
    state: tauri::State<'_, DbState>,
    password: Option<String>,
) -> Result<Option<BackupImportResult>, String> {
    let _ = crate::commands::storage::flush_document_persist(&state.persist_queue, None);
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let documents_dir_hint = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        storage::get_documents_dir(&app, &conn)?
    };
    let pw = password
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(str::to_owned);
    let dialog_app = app.clone();

    let extracted = tauri::async_runtime::spawn_blocking(move || {
        let picked = dialog_app
            .dialog()
            .file()
            .set_title("Importovať zálohu knižnice")
            .add_filter("Scribe archive", &["scribe-backup.zip", "zip"])
            .blocking_pick_file();

        let Some(picked) = picked else {
            return Ok::<Option<(BackupManifest, PathBuf, PathBuf, u32)>, String>(None);
        };

        let archive_path = PathBuf::from(picked.to_string());
        let result = extract_library_archive(
            &archive_path,
            &app_dir,
            &documents_dir_hint,
            pw.as_deref(),
        )?;
        Ok(Some(result))
    })
    .await
    .map_err(|e| format!("Import worker zlyhal: {e}"))??;

    let Some((manifest, db_path, documents_dir, documents_imported)) = extracted else {
        return Ok(None);
    };

    let videos_remapped = {
        let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
        *conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| e.to_string())?;
        let remapped = remap_library_video_paths(&conn, &documents_dir)?;
        storage::reconcile_storage(&app, &conn)?;
        remapped
    };

    Ok(Some(BackupImportResult {
        documents_imported,
        videos_remapped,
        // Locale-neutral detail; Settings UI builds the user-facing toast via i18n.
        message: format!(
            "Scribe {} (schema v{})",
            manifest.version, manifest.schema_version
        ),
    }))
}

// ── Native auto-backup scheduler ────────────────────────────────────────────

const META_AUTO_BACKUP_ENABLED: &str = "auto_backup_enabled";
const META_AUTO_BACKUP_INTERVAL_HOURS: &str = "auto_backup_interval_hours";
const META_AUTO_BACKUP_DIRECTORY: &str = "auto_backup_directory";
const META_AUTO_BACKUP_LAST_AT: &str = "auto_backup_last_at";
const META_AUTO_BACKUP_PASSWORD: &str = "auto_backup_password";
const MIN_INTERVAL_HOURS: i64 = 1;
const MAX_INTERVAL_HOURS: i64 = 24 * 30;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupConfig {
    pub enabled: bool,
    pub interval_hours: i64,
    pub directory: Option<String>,
    pub last_at: Option<i64>,
    /// True when AES password is configured (password itself is never returned).
    #[serde(default)]
    pub encrypted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupEvent {
    pub path: String,
    pub at: i64,
}

fn meta_get(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM meta WHERE key = ?1",
        rusqlite::params![key],
        |row| row.get(0),
    )
    .ok()
}

fn meta_set(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn clamp_interval_hours(hours: i64) -> i64 {
    hours.clamp(MIN_INTERVAL_HOURS, MAX_INTERVAL_HOURS)
}

fn auto_backup_password(conn: &Connection) -> Option<String> {
    // Prefer OS keychain; migrate legacy meta password once.
    if let Some(pw) = crate::security::get_auto_backup_password() {
        return Some(pw);
    }
    let legacy = meta_get(conn, META_AUTO_BACKUP_PASSWORD).filter(|p| !p.trim().is_empty())?;
    if crate::security::set_auto_backup_password(Some(&legacy)).is_ok() {
        let _ = conn.execute(
            "DELETE FROM meta WHERE key = ?1",
            rusqlite::params![META_AUTO_BACKUP_PASSWORD],
        );
    }
    Some(legacy)
}

fn read_auto_backup_config(conn: &Connection) -> AutoBackupConfig {
    let enabled = meta_get(conn, META_AUTO_BACKUP_ENABLED)
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let interval_hours = meta_get(conn, META_AUTO_BACKUP_INTERVAL_HOURS)
        .and_then(|v| v.parse::<i64>().ok())
        .map(clamp_interval_hours)
        .unwrap_or(24);
    let directory = meta_get(conn, META_AUTO_BACKUP_DIRECTORY).filter(|v| !v.trim().is_empty());
    let last_at = meta_get(conn, META_AUTO_BACKUP_LAST_AT).and_then(|v| v.parse::<i64>().ok());
    let encrypted = auto_backup_password(conn).is_some();
    AutoBackupConfig {
        enabled,
        interval_hours,
        directory,
        last_at,
        encrypted,
    }
}

fn is_backup_due(config: &AutoBackupConfig, now_ms: i64) -> bool {
    if !config.enabled {
        return false;
    }
    match config.last_at {
        None => true,
        Some(last) => now_ms.saturating_sub(last) >= config.interval_hours * 60 * 60 * 1000,
    }
}

fn check_interval_ms(interval_hours: i64) -> u64 {
    let hours = clamp_interval_hours(interval_hours) as u64;
    if hours <= 1 {
        5 * 60 * 1000
    } else if hours <= 6 {
        15 * 60 * 1000
    } else {
        60 * 60 * 1000
    }
}

pub struct AutoBackupScheduler {
    wake: Mutex<Option<mpsc::Sender<()>>>,
}

impl AutoBackupScheduler {
    pub fn new() -> Self {
        Self {
            wake: Mutex::new(None),
        }
    }

    pub fn wake(&self) {
        if let Ok(guard) = self.wake.lock() {
            if let Some(tx) = guard.as_ref() {
                let _ = tx.send(());
            }
        }
    }
}

use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::Emitter;

pub fn spawn_auto_backup_scheduler(app: AppHandle) -> Arc<AutoBackupScheduler> {
    let scheduler = Arc::new(AutoBackupScheduler::new());
    let (wake_tx, wake_rx) = mpsc::channel::<()>();
    if let Ok(mut guard) = scheduler.wake.lock() {
        *guard = Some(wake_tx);
    }

    thread::Builder::new()
        .name("scribe-auto-backup".into())
        .spawn(move || {
            loop {
                let config = {
                    let Some(state) = app.try_state::<DbState>() else {
                        let _ = wake_rx.recv_timeout(Duration::from_secs(30));
                        continue;
                    };
                    let Ok(conn) = state.conn.lock() else {
                        let _ = wake_rx.recv_timeout(Duration::from_secs(5));
                        continue;
                    };
                    read_auto_backup_config(&conn)
                };

                let now_ms = chrono::Utc::now().timestamp_millis();
                if is_backup_due(&config, now_ms) {
                    match run_scheduled_backup(&app, &config) {
                        Ok(event) => {
                            let _ = app.emit("auto-backup-completed", &event);
                            log::info!("Auto-backup written to {}", event.path);
                        }
                        Err(error) => log::warn!("Auto-backup failed: {error}"),
                    }
                }

                let wait = Duration::from_millis(check_interval_ms(config.interval_hours));
                match wake_rx.recv_timeout(wait) {
                    Ok(()) | Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => return,
                }
            }
        })
        .ok();

    scheduler
}

fn run_scheduled_backup(app: &AppHandle, config: &AutoBackupConfig) -> Result<AutoBackupEvent, String> {
    let state = app
        .try_state::<DbState>()
        .ok_or_else(|| "Database not ready".to_string())?;
    let dir = resolve_auto_backup_dir(config.directory.as_deref().unwrap_or(""))?;
    let (db_path, documents_dir, schema_version) = prepare_backup_paths(app, &state)?;
    let out_path = dir.join(format!(
        "{BACKUP_FILE_PREFIX}{}.zip",
        chrono::Utc::now().format("%Y%m%d-%H%M%S")
    ));
    let password = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        auto_backup_password(&conn)
    };
    let result = write_library_archive(
        &out_path,
        &db_path,
        &documents_dir,
        schema_version,
        password.as_deref(),
    )?;
    let _ = prune_old_auto_backups(&dir, AUTO_BACKUP_KEEP);
    let at = chrono::Utc::now().timestamp_millis();
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        meta_set(&conn, META_AUTO_BACKUP_LAST_AT, &at.to_string())?;
    }
    Ok(AutoBackupEvent {
        path: result.path,
        at,
    })
}

#[tauri::command]
pub fn get_auto_backup_config(state: tauri::State<'_, DbState>) -> Result<AutoBackupConfig, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    Ok(read_auto_backup_config(&conn))
}

#[tauri::command]
pub fn configure_auto_backup(
    state: tauri::State<'_, DbState>,
    scheduler: tauri::State<'_, Arc<AutoBackupScheduler>>,
    config: AutoBackupConfig,
) -> Result<AutoBackupConfig, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let interval = clamp_interval_hours(config.interval_hours);
    meta_set(
        &conn,
        META_AUTO_BACKUP_ENABLED,
        if config.enabled { "1" } else { "0" },
    )?;
    meta_set(
        &conn,
        META_AUTO_BACKUP_INTERVAL_HOURS,
        &interval.to_string(),
    )?;
    match config.directory.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        Some(dir) => meta_set(&conn, META_AUTO_BACKUP_DIRECTORY, dir)?,
        None => {
            conn.execute(
                "DELETE FROM meta WHERE key = ?1",
                rusqlite::params![META_AUTO_BACKUP_DIRECTORY],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    if let Some(last_at) = config.last_at {
        meta_set(&conn, META_AUTO_BACKUP_LAST_AT, &last_at.to_string())?;
    }
    let next = read_auto_backup_config(&conn);
    drop(conn);
    scheduler.wake();
    Ok(next)
}

/// Set or clear the AES password used for automatic backup archives.
/// Stored in the OS keychain (never returned to the webview).
/// Pass `None` or empty string to clear (archives written unencrypted).
#[tauri::command]
pub fn set_auto_backup_password(
    state: tauri::State<'_, DbState>,
    scheduler: tauri::State<'_, Arc<AutoBackupScheduler>>,
    password: Option<String>,
) -> Result<AutoBackupConfig, String> {
    let pw = password.as_deref().map(str::trim).filter(|p| !p.is_empty());
    crate::security::set_auto_backup_password(pw)?;
    // Drop any legacy plaintext copy from SQLite meta.
    let next = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        let _ = conn.execute(
            "DELETE FROM meta WHERE key = ?1",
            rusqlite::params![META_AUTO_BACKUP_PASSWORD],
        );
        read_auto_backup_config(&conn)
    };
    scheduler.wake();
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prune_keeps_newest_archives() {
        let dir = std::env::temp_dir().join(format!(
            "scribe-backup-prune-{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
        ));
        fs::create_dir_all(&dir).unwrap();

        for name in [
            "scribe-backup-old.zip",
            "scribe-backup-mid.zip",
            "scribe-backup-new.zip",
            "notes.txt",
        ] {
            fs::write(dir.join(name), b"x").unwrap();
            std::thread::sleep(std::time::Duration::from_millis(15));
        }

        let removed = prune_old_auto_backups(&dir, 2).unwrap();
        assert_eq!(removed, 1);
        assert!(!dir.join("scribe-backup-old.zip").exists());
        assert!(dir.join("scribe-backup-mid.zip").exists());
        assert!(dir.join("scribe-backup-new.zip").exists());
        assert!(dir.join("notes.txt").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn empty_directory_resolves_to_default() {
        let dir = resolve_auto_backup_dir("").expect("default backup dir");
        assert!(dir.ends_with("Backups"));
        assert!(dir.is_dir());
    }

    #[test]
    fn backup_due_when_never_run() {
        let config = AutoBackupConfig {
            enabled: true,
            interval_hours: 24,
            directory: None,
            last_at: None,
            encrypted: false,
        };
        assert!(is_backup_due(&config, 1_000_000));
    }

    #[test]
    fn media_files_skip_deflate() {
        assert_eq!(
            compression_for_path(Path::new("photo.PNG")),
            CompressionMethod::Stored
        );
        assert_eq!(
            compression_for_path(Path::new("clip.mp4")),
            CompressionMethod::Stored
        );
        assert_eq!(
            compression_for_path(Path::new("note.scribe")),
            CompressionMethod::Deflated
        );
    }

    #[test]
    fn remap_library_video_paths_rewrites_copy_mode_sources() {
        let stamp = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0);
        let root = std::env::temp_dir().join(format!("scribe-backup-video-remap-{stamp}"));
        let docs = root.join("Documents");
        let files = docs.join("files");
        let rel = "attachments/videos/vid-remap-1/source.mp4";
        let abs_dir = files.join("attachments/videos/vid-remap-1");
        fs::create_dir_all(&abs_dir).unwrap();
        let abs = abs_dir.join("source.mp4");
        fs::write(&abs, b"fake-mp4").unwrap();

        let db_path = root.join("scribe.db");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(
            "CREATE TABLE library_videos (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                import_mode TEXT NOT NULL,
                source_path TEXT NOT NULL,
                rel_path TEXT,
                size_bytes INTEGER NOT NULL,
                content_hash TEXT,
                duration_secs REAL,
                width INTEGER,
                height INTEGER,
                codec TEXT,
                thumb_rel_path TEXT,
                transcript_rel_path TEXT,
                transcript_document_id TEXT,
                status TEXT NOT NULL,
                error TEXT,
                document_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE documents (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content_json TEXT NOT NULL,
                folder_id TEXT,
                file_path TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                library_id TEXT
            );",
        )
        .unwrap();

        let stale = "/old/machine/files/attachments/videos/vid-remap-1/source.mp4";
        conn.execute(
            "INSERT INTO library_videos (
                id, title, import_mode, source_path, rel_path, size_bytes,
                status, created_at, updated_at
             ) VALUES (?1, 'Clip', 'copy', ?2, ?3, 8, 'ready', 1, 1)",
            rusqlite::params!["vid-remap-1", stale, rel],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO documents (id, title, content_json, created_at, updated_at)
             VALUES ('doc1', 'Note', ?1, 1, 1)",
            rusqlite::params![format!(
                r#"{{"type":"doc","content":[{{"type":"video","attrs":{{"src":"{stale}","libraryVideoId":"vid-remap-1"}}}}]}}"#
            )],
        )
        .unwrap();

        let n = remap_library_video_paths(&conn, &docs).unwrap();
        assert_eq!(n, 1);

        let source: String = conn
            .query_row(
                "SELECT source_path FROM library_videos WHERE id = 'vid-remap-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_ne!(source, stale);
        assert!(source.ends_with("attachments/videos/vid-remap-1/source.mp4"));
        assert!(Path::new(&source).is_file());

        let content: String = conn
            .query_row(
                "SELECT content_json FROM documents WHERE id = 'doc1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!content.contains(stale));
        assert!(content.contains("source.mp4"));
        assert!(content.contains("vid-remap-1"));

        let _ = fs::remove_dir_all(&root);
    }
}
