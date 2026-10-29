//! App-specific DB hooks used during reconcile (library, FTS, revisions, conflicts).

/// Callbacks into the host database while syncing disk ↔ SQLite.
pub trait ReconcileHooks {
    fn active_library_id(&self, conn: &rusqlite::Connection) -> String;

    fn sync_document_fts(
        &self,
        conn: &rusqlite::Connection,
        id: &str,
        title: &str,
        content_json: &str,
    ) -> Result<(), String>;

    fn save_revision_before_conflict(
        &self,
        conn: &rusqlite::Connection,
        id: &str,
        title: &str,
        content_json: &str,
    ) -> Result<(), String>;

    fn record_conflict(
        &self,
        conn: &rusqlite::Connection,
        id: &str,
        title: &str,
        disk_updated_at: i64,
        db_updated_at: i64,
    ) -> Result<(), String>;
}
