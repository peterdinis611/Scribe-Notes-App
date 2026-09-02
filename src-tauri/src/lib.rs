mod commands;
mod backup;
mod db;
mod export;
mod nlp;
mod security;
mod storage;

use db::{init_db, DbState};
use nlp::NlpSidecar;
use security::PathAccessGate;
use storage::DiskPersistQueue;
use tauri::{Emitter, Manager, RunEvent};

#[cfg(target_os = "macos")]
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
#[cfg(target_os = "macos")]
use tauri::tray::TrayIconBuilder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
            app.manage(PathAccessGate::new());
            app.manage(NlpSidecar::new(nlp::resolve_script_path(app.handle())));

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

                let quick_note = MenuItemBuilder::with_id("tray-quick-note", "Quick Note")
                    .build(app)?;
                let today_note =
                    MenuItemBuilder::with_id("tray-today-note", "Today's journal").build(app)?;
                let show_app = MenuItemBuilder::with_id("tray-show", "Show Scribe").build(app)?;
                let quit = PredefinedMenuItem::quit(app, Some("Quit"))?;

                let tray_menu = MenuBuilder::new(app)
                    .item(&quick_note)
                    .item(&today_note)
                    .separator()
                    .item(&show_app)
                    .item(&quit)
                    .build()?;

                let tray_icon = app.default_window_icon().cloned();
                if let Some(icon) = tray_icon {
                    let _tray = TrayIconBuilder::new()
                        .icon(icon)
                        .menu(&tray_menu)
                        .tooltip("Scribe")
                        .on_menu_event(|app, event| match event.id.as_ref() {
                            "tray-quick-note" => {
                                let _ = app.emit("tray-quick-note", ());
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            "tray-today-note" => {
                                let _ = app.emit("tray-today-note", ());
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            "tray-show" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            _ => {}
                        })
                        .build(app)?;
                }

                let menu = MenuBuilder::new(app)
                    .item(&app_menu)
                    .item(&edit_menu)
                    .build()?;
                app.set_menu(menu)?;
            }

            // Open .scribe paths passed on the command line (Open With / double-click).
            for arg in std::env::args().skip(1) {
                if arg.starts_with('-') {
                    continue;
                }
                if arg.ends_with(".scribe") || arg.ends_with(".scribe.json") {
                    let _ = app.handle().emit("open-file", arg);
                }
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
            commands::documents::set_document_pinned,
            commands::documents::set_document_tags,
            commands::documents::add_document_tag,
            commands::documents::remove_document_tag,
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
            commands::folders::set_folder_pinned,
            commands::templates::list_custom_template_categories,
            commands::templates::create_custom_template_category,
            commands::templates::delete_custom_template_category,
            commands::templates::list_custom_templates,
            commands::templates::create_custom_template,
            commands::templates::delete_custom_template,
            commands::search::search_documents,
            commands::nlp::nlp_status,
            commands::nlp::nlp_set_enabled,
            commands::nlp::nlp_semantic_search,
            commands::nlp::nlp_search,
            commands::nlp::nlp_index_document,
            commands::nlp::nlp_index_all,
            commands::nlp::nlp_journal_summary,
            commands::nlp::nlp_suggest_tags,
            commands::nlp::nlp_library_report,
            commands::nlp::nlp_similar_documents,
            commands::nlp::nlp_document_tasks,
            commands::nlp::nlp_journal_tasks,
            commands::nlp::nlp_set_embed_backend,
            commands::revisions::list_document_revisions,
            commands::revisions::get_document_revision,
            commands::revisions::restore_document_revision,
            commands::storage::get_storage_settings,
            commands::storage::pick_documents_directory,
            commands::storage::reveal_in_finder,
            commands::import_export::grant_scoped_path,
            commands::import_export::read_text_file,
            commands::import_export::read_binary_file,
            commands::import_export::pick_and_import_file,
            commands::import_export::import_file,
            commands::import_export::prepare_pages_import,
            commands::import_export::cleanup_temp_import_file,
            commands::import_export::export_document,
            commands::import_export::export_pdf_bytes,
            commands::import_export::scan_scribe_files,
            commands::import_export::force_save_document,
            commands::images::save_document_image,
            commands::system::get_backend_stats,
            commands::system::flush_pending_writes,
            commands::system::reconcile_storage,
            commands::system::list_system_font_families,
            commands::links::list_link_graph,
            backup::export_library_archive,
            backup::import_library_archive,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let RunEvent::Opened { urls } = event {
                for url in urls {
                    let path = url
                        .to_file_path()
                        .ok()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|| url.to_string());
                    if path.ends_with(".scribe")
                        || path.ends_with(".scribe.json")
                        || path.ends_with(".docx")
                        || path.ends_with(".pages")
                        || path.ends_with(".md")
                        || path.ends_with(".markdown")
                        || path.ends_with(".txt")
                    {
                        let _ = app_handle.emit("open-file", path);
                    }
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (app_handle, event);
            }
        });
}
