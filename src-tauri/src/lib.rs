mod commands;
mod db;
mod export;
mod storage;

use db::{init_db, DbState};
use storage::DiskPersistQueue;
use tauri::Manager;

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let (conn, db_path) = init_db(&app.handle())?;
            let reconcile = storage::reconcile_storage(&app.handle(), &conn);
            if let Err(error) = reconcile {
                log::warn!("Storage reconcile on startup failed: {error}");
            }

            let persist_queue = DiskPersistQueue::spawn(db_path.clone());
            app.manage(DbState {
                conn: std::sync::Mutex::new(conn),
                db_path,
                persist_queue,
            });

            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                let _ = apply_vibrancy(
                    &window,
                    NSVisualEffectMaterial::Sidebar,
                    None,
                    None,
                );
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::documents::list_documents,
            commands::documents::get_document,
            commands::documents::create_document,
            commands::documents::update_document,
            commands::documents::delete_document,
            commands::documents::clear_all_documents,
            commands::folders::list_folders,
            commands::folders::create_folder,
            commands::folders::rename_folder,
            commands::folders::delete_folder,
            commands::folders::move_folder,
            commands::folders::move_document_to_folder,
            commands::search::search_documents,
            commands::revisions::list_document_revisions,
            commands::revisions::restore_document_revision,
            commands::storage::get_storage_settings,
            commands::storage::pick_documents_directory,
            commands::storage::reveal_in_finder,
            commands::import_export::read_text_file,
            commands::import_export::pick_and_import_file,
            commands::import_export::import_file,
            commands::import_export::export_document,
            commands::import_export::scan_scribe_files,
            commands::import_export::force_save_document,
            commands::images::save_document_image,
            commands::system::get_backend_stats,
            commands::system::flush_pending_writes,
            commands::system::reconcile_storage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
