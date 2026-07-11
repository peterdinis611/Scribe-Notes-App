mod commands;
mod db;
mod export;
mod storage;

use db::{init_db, DbState};
use storage::DiskPersistQueue;
use tauri::Manager;

#[cfg(target_os = "macos")]
use tauri::menu::{MenuBuilder, SubmenuBuilder};
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
                persist_queue,
            });

            #[cfg(target_os = "macos")]
            {
                let app_menu = SubmenuBuilder::new(app, "Scribe")
                    .about(None)
                    .separator()
                    .services()
                    .separator()
                    .hide()
                    .hide_others()
                    .separator()
                    .quit()
                    .build()?;

                // macOS routes Cmd+C/V/X/Z/A through the app menu bar — without Edit items
                // the webview never receives copy/paste/cut/undo shortcuts.
                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .separator()
                    .select_all()
                    .build()?;

                let menu = MenuBuilder::new(app)
                    .item(&app_menu)
                    .item(&edit_menu)
                    .build()?;
                app.set_menu(menu)?;
            }

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
            commands::documents::duplicate_document,
            commands::documents::delete_document,
            commands::documents::restore_document,
            commands::documents::purge_document,
            commands::documents::empty_trash,
            commands::documents::list_trashed_documents,
            commands::documents::set_document_favorite,
            commands::documents::set_document_tags,
            commands::documents::list_backlinks,
            commands::documents::list_outgoing_links,
            commands::documents::clear_all_documents,
            commands::comments::list_comment_threads,
            commands::comments::create_comment_thread,
            commands::comments::add_comment_reply,
            commands::comments::resolve_comment_thread,
            commands::comments::delete_comment_thread,
            commands::folders::list_folders,
            commands::folders::create_folder,
            commands::folders::rename_folder,
            commands::folders::delete_folder,
            commands::folders::trash_folder_documents,
            commands::folders::move_folder,
            commands::folders::move_document_to_folder,
            commands::templates::list_custom_template_categories,
            commands::templates::create_custom_template_category,
            commands::templates::delete_custom_template_category,
            commands::templates::list_custom_templates,
            commands::templates::create_custom_template,
            commands::templates::delete_custom_template,
            commands::search::search_documents,
            commands::revisions::list_document_revisions,
            commands::revisions::get_document_revision,
            commands::revisions::restore_document_revision,
            commands::storage::get_storage_settings,
            commands::storage::pick_documents_directory,
            commands::storage::reveal_in_finder,
            commands::import_export::read_text_file,
            commands::import_export::pick_and_import_file,
            commands::import_export::import_file,
            commands::import_export::export_document,
            commands::import_export::export_pdf_bytes,
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
