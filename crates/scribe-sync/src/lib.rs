//! Disk ↔ SQLite sync for Scribe libraries (`.scribe` files).
//!
//! Owns the on-disk document schema, persist queue, and reconcile algorithm.
//! Host apps (Tauri, MCP) supply [`ReconcileHooks`] for library / FTS / conflict
//! bookkeeping. Platform FS watchers stay in the host.

mod disk;
mod hooks;
mod persist_queue;
mod reconcile;
mod watch_ignore;

pub use disk::{
    collect_scribe_files, default_documents_dir, delete_document_file, document_file_is_current,
    documents_dir_access_granted, ensure_documents_dir, file_path_for_title, get_documents_dir,
    mark_documents_dir_access_granted, pdf_export_dir, read_scribe_file, resolve_unique_path,
    sanitize_filename, set_documents_dir, write_document_file, write_document_file_if_changed,
    DiskDocument, FILE_EXTENSION, META_DOCUMENTS_DIR, META_DOCUMENTS_DIR_GRANTED,
};
pub use hooks::ReconcileHooks;
pub use persist_queue::{
    DiskPersistError, DiskPersistQueue, FlushPendingWritesResult, PersistJob,
};
pub use reconcile::{reconcile_storage, ReconcileResult};
pub use watch_ignore::should_ignore_path;
