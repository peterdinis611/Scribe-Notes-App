//! Tauri adapter around [`scribe_sync`] — disk ↔ SQLite sync + FS watcher.

use rusqlite::Connection;
use std::path::PathBuf;
use tauri::AppHandle;

mod hooks;
pub mod watch;

// Re-export the full sync surface for commands / backup / export.
#[allow(unused_imports)]
pub use scribe_sync::{
    collect_scribe_files, default_documents_dir, delete_document_file, document_file_is_current,
    documents_dir_access_granted, ensure_documents_dir, file_path_for_title,
    mark_documents_dir_access_granted, pdf_export_dir, read_scribe_file, resolve_unique_path,
    sanitize_filename, set_documents_dir, write_document_file, write_document_file_if_changed,
    DiskDocument, DiskPersistError, DiskPersistQueue, FlushPendingWritesResult, PersistJob,
    ReconcileResult, FILE_EXTENSION, META_DOCUMENTS_DIR, META_DOCUMENTS_DIR_GRANTED,
};
pub use watch::DocumentsWatcher;

use hooks::AppReconcileHooks;

/// Compatibility wrapper — `AppHandle` is unused (path comes from SQLite meta).
pub fn get_documents_dir(_app: &AppHandle, conn: &Connection) -> Result<PathBuf, String> {
    scribe_sync::get_documents_dir(conn)
}

pub fn reconcile_storage(app: &AppHandle, conn: &Connection) -> Result<ReconcileResult, String> {
    let dir = get_documents_dir(app, conn)?;
    scribe_sync::reconcile_storage(conn, &dir, &AppReconcileHooks)
}

pub use scribe_core::duplicate_document_assets;

#[cfg(test)]
use scribe_core::remap_document_asset_paths;

#[cfg(test)]
mod asset_tests {
    use super::*;
    use std::fs;

    #[test]
    fn remap_document_asset_paths_rewrites_document_id() {
        let old_id = "11111111-1111-1111-1111-111111111111";
        let new_id = "22222222-2222-2222-2222-222222222222";
        let content = format!(r#"{{"src":"/Users/me/Scribe/assets/{old_id}/photo.png"}}"#);

        let remapped = remap_document_asset_paths(&content, old_id, new_id);
        assert!(remapped.contains(&format!("/assets/{new_id}/photo.png")));
        assert!(!remapped.contains(old_id));
    }

    #[test]
    fn duplicate_document_assets_copies_files_and_rewrites_paths() {
        let temp = std::env::temp_dir().join(format!("scribe-test-{}", uuid::Uuid::new_v4()));
        let old_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
        let new_id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
        let from_assets = temp.join("assets").join(old_id);
        fs::create_dir_all(&from_assets).unwrap();
        fs::write(from_assets.join("image.png"), b"png-bytes").unwrap();

        let content = format!(
            r#"{{"src":"{}/assets/{}/image.png"}}"#,
            temp.display(),
            old_id
        );

        let remapped =
            duplicate_document_assets(&temp, old_id, new_id, &content).expect("duplicate assets");

        let copied = temp.join("assets").join(new_id).join("image.png");
        assert!(copied.is_file());
        assert!(remapped.contains(&format!("/assets/{new_id}/image.png")));
        assert!(!remapped.contains(old_id));

        let _ = fs::remove_dir_all(&temp);
    }
}
