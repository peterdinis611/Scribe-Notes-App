use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, mpsc::{self, Receiver, Sender}};
use std::thread;
use std::time::{Duration, Instant};

use rusqlite::Connection;
use serde::Serialize;

use super::{write_document_file_if_changed, DiskDocument};

const DEBOUNCE_MS: u64 = 1200;
const POLL_MS: u64 = 400;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskPersistError {
    pub document_id: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlushPendingWritesResult {
    pub flushed: u32,
    pub errors: Vec<DiskPersistError>,
}

#[derive(Clone)]
pub struct PersistJob {
    pub id: String,
    pub title: String,
    pub content_json: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub old_path: Option<String>,
    pub documents_dir: PathBuf,
}

enum Command {
    Schedule(PersistJob),
    Flush {
        id: Option<String>,
        reply: Sender<FlushPendingWritesResult>,
    },
}

#[derive(Clone)]
pub struct DiskPersistQueue {
    tx: Sender<Command>,
    errors: Arc<Mutex<HashMap<String, String>>>,
}

impl DiskPersistQueue {
    pub fn spawn(db_path: PathBuf) -> Self {
        let errors = Arc::new(Mutex::new(HashMap::new()));
        let worker_errors = Arc::clone(&errors);
        let (tx, rx) = mpsc::channel();
        thread::Builder::new()
            .name("scribe-disk-persist".into())
            .spawn(move || worker_loop(db_path, rx, worker_errors))
            .expect("failed to spawn disk persist worker");

        Self { tx, errors }
    }

    pub fn schedule(&self, job: PersistJob) {
        let _ = self.tx.send(Command::Schedule(job));
    }

    pub fn record_error(&self, document_id: &str, message: String) {
        if let Ok(mut errors) = self.errors.lock() {
            errors.insert(document_id.to_string(), message);
        }
    }

    pub fn clear_error(&self, document_id: &str) {
        if let Ok(mut errors) = self.errors.lock() {
            errors.remove(document_id);
        }
    }

    pub fn take_errors(&self, document_id: Option<&str>) -> Vec<DiskPersistError> {
        let Ok(mut errors) = self.errors.lock() else {
            return Vec::new();
        };

        match document_id {
            Some(id) => errors
                .remove(id)
                .map(|message| vec![DiskPersistError {
                    document_id: id.to_string(),
                    message,
                }])
                .unwrap_or_default(),
            None => errors
                .drain()
                .map(|(document_id, message)| DiskPersistError {
                    document_id,
                    message,
                })
                .collect(),
        }
    }

    pub fn flush(&self, id: Option<&str>) -> Result<FlushPendingWritesResult, String> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.tx
            .send(Command::Flush {
                id: id.map(str::to_string),
                reply: reply_tx,
            })
            .map_err(|e| format!("Disková fronta nie je dostupná: {e}"))?;

        reply_rx
            .recv()
            .map_err(|e| format!("Disková fronta neodpovedala: {e}"))
    }
}

fn worker_loop(db_path: PathBuf, rx: Receiver<Command>, errors: Arc<Mutex<HashMap<String, String>>>) {
    let conn = match Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(error) => {
            log::error!("Disk persist worker failed to open database: {error}");
            return;
        }
    };

    let _ = conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");

    let mut pending: HashMap<String, (PersistJob, Instant)> = HashMap::new();

    loop {
        match rx.recv_timeout(Duration::from_millis(POLL_MS)) {
            Ok(Command::Schedule(job)) => {
                pending.insert(job.id.clone(), (job, Instant::now()));
            }
            Ok(Command::Flush { id, reply }) => {
                let result = flush_jobs(&mut pending, &conn, &errors, id.as_deref());
                let _ = reply.send(result);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                let _ = flush_jobs(&mut pending, &conn, &errors, None);
                break;
            }
        }

        let now = Instant::now();
        let ready: Vec<String> = pending
            .iter()
            .filter(|(_, (_, scheduled))| {
                now.duration_since(*scheduled) >= Duration::from_millis(DEBOUNCE_MS)
            })
            .map(|(id, _)| id.clone())
            .collect();

        for id in ready {
            if let Some((job, _)) = pending.remove(&id) {
                persist_job(&conn, &errors, job);
            }
        }
    }
}

fn persist_job(conn: &Connection, errors: &Arc<Mutex<HashMap<String, String>>>, job: PersistJob) {
    let document_id = job.id.clone();
    match execute_job(conn, job) {
        Ok(true) => {
            if let Ok(mut map) = errors.lock() {
                map.remove(&document_id);
            }
        }
        Ok(false) => {
            if let Ok(mut map) = errors.lock() {
                map.remove(&document_id);
            }
        }
        Err(error) => {
            log::warn!("Deferred disk persist failed for {document_id}: {error}");
            if let Ok(mut map) = errors.lock() {
                map.insert(document_id, error);
            }
        }
    }
}

fn flush_jobs(
    pending: &mut HashMap<String, (PersistJob, Instant)>,
    conn: &Connection,
    errors: &Arc<Mutex<HashMap<String, String>>>,
    id: Option<&str>,
) -> FlushPendingWritesResult {
    let ids: Vec<String> = match id {
        Some(document_id) => pending
            .contains_key(document_id)
            .then(|| vec![document_id.to_string()])
            .unwrap_or_default(),
        None => pending.keys().cloned().collect(),
    };

    let mut flushed = 0u32;
    let mut flush_errors = Vec::new();

    for document_id in ids {
        let Some((job, _)) = pending.remove(&document_id) else {
            continue;
        };
        match execute_job(conn, job) {
            Ok(true) => {
                flushed += 1;
                if let Ok(mut map) = errors.lock() {
                    map.remove(&document_id);
                }
            }
            Ok(false) => {
                if let Ok(mut map) = errors.lock() {
                    map.remove(&document_id);
                }
            }
            Err(message) => {
                log::warn!("Disk persist flush failed for {document_id}: {message}");
                if let Ok(mut map) = errors.lock() {
                    map.insert(document_id.clone(), message.clone());
                }
                flush_errors.push(DiskPersistError {
                    document_id,
                    message,
                });
            }
        }
    }

    FlushPendingWritesResult {
        flushed,
        errors: flush_errors,
    }
}

fn execute_job(conn: &Connection, job: PersistJob) -> Result<bool, String> {
    let disk_doc = DiskDocument {
        version: 1,
        id: job.id.clone(),
        title: job.title,
        content_json: job.content_json,
        created_at: job.created_at,
        updated_at: job.updated_at,
    };

    let Some(path) =
        write_document_file_if_changed(&job.documents_dir, &disk_doc, job.old_path.as_deref())?
    else {
        return Ok(false);
    };

    let path_str = path.to_string_lossy().to_string();
    conn.execute(
        "UPDATE documents SET file_path = ?1 WHERE id = ?2",
        rusqlite::params![path_str, job.id],
    )
    .map_err(|error| error.to_string())?;

    Ok(true)
}
