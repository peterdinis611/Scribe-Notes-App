use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::{Duration, Instant};

use rusqlite::Connection;

use super::{write_document_file_if_changed, DiskDocument};

const DEBOUNCE_MS: u64 = 1200;
const POLL_MS: u64 = 400;

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
        reply: Sender<Result<u32, String>>,
    },
}

#[derive(Clone)]
pub struct DiskPersistQueue {
    tx: Sender<Command>,
}

impl DiskPersistQueue {
    pub fn spawn(db_path: PathBuf) -> Self {
        let (tx, rx) = mpsc::channel();
        thread::Builder::new()
            .name("scribe-disk-persist".into())
            .spawn(move || worker_loop(db_path, rx))
            .expect("failed to spawn disk persist worker");

        Self { tx }
    }

    pub fn schedule(&self, job: PersistJob) {
        let _ = self.tx.send(Command::Schedule(job));
    }

    pub fn flush(&self, id: Option<&str>) -> Result<u32, String> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.tx
            .send(Command::Flush {
                id: id.map(str::to_string),
                reply: reply_tx,
            })
            .map_err(|e| format!("Disková fronta nie je dostupná: {e}"))?;

        reply_rx
            .recv()
            .map_err(|e| format!("Disková fronta neodpovedala: {e}"))?
    }
}

fn worker_loop(db_path: PathBuf, rx: Receiver<Command>) {
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
                let flushed = flush_jobs(&mut pending, &conn, id.as_deref());
                let _ = reply.send(Ok(flushed));
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                let _ = flush_jobs(&mut pending, &conn, None);
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
                if let Err(error) = execute_job(&conn, job) {
                    log::warn!("Deferred disk persist failed: {error}");
                }
            }
        }
    }
}

fn flush_jobs(
    pending: &mut HashMap<String, (PersistJob, Instant)>,
    conn: &Connection,
    id: Option<&str>,
) -> u32 {
    let ids: Vec<String> = match id {
        Some(document_id) => pending
            .contains_key(document_id)
            .then(|| vec![document_id.to_string()])
            .unwrap_or_default(),
        None => pending.keys().cloned().collect(),
    };

    let mut flushed = 0u32;
    for document_id in ids {
        let Some((job, _)) = pending.remove(&document_id) else {
            continue;
        };
        match execute_job(conn, job) {
            Ok(true) => flushed += 1,
            Ok(false) => {}
            Err(error) => log::warn!("Disk persist flush failed for {document_id}: {error}"),
        }
    }

    flushed
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
