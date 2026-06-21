mod commands;
mod db;
mod export;
mod storage;

use db::{init_db, DbState};
use std::sync::Mutex;
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

            let conn = init_db(&app.handle())?;
            storage::sync_all_documents_to_disk(&app.handle(), &conn)?;
            app.manage(DbState {
                conn: Mutex::new(conn),
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
            commands::storage::get_storage_settings,
            commands::storage::pick_documents_directory,
            commands::storage::reveal_in_finder,
            commands::import_export::pick_and_import_file,
            commands::import_export::import_file,
            commands::import_export::export_document,
            commands::import_export::scan_scribe_files,
            commands::import_export::force_save_document,
            commands::images::save_document_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
