use rusqlite::Connection;
use scribe_sync::ReconcileHooks;

pub struct AppReconcileHooks;

impl ReconcileHooks for AppReconcileHooks {
    fn active_library_id(&self, conn: &Connection) -> String {
        crate::libraries::active_library_id(conn)
    }

    fn sync_document_fts(
        &self,
        conn: &Connection,
        id: &str,
        title: &str,
        content_json: &str,
    ) -> Result<(), String> {
        crate::db::sync_document_fts(conn, id, title, content_json)
    }

    fn save_revision_before_conflict(
        &self,
        conn: &Connection,
        id: &str,
        title: &str,
        content_json: &str,
    ) -> Result<(), String> {
        crate::db::save_revision(
            conn,
            id,
            title,
            content_json,
            Some("Before sync conflict"),
            true,
        )
        .map(|_| ())
    }

    fn record_conflict(
        &self,
        conn: &Connection,
        id: &str,
        title: &str,
        disk_updated_at: i64,
        db_updated_at: i64,
    ) -> Result<(), String> {
        crate::libraries::record_conflict(conn, id, title, disk_updated_at, db_updated_at)
    }
}
