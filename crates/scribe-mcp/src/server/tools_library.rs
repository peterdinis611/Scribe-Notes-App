use crate::server::ScribeMcp;
use crate::tools;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::{tool, tool_router};


#[tool_router(router = router_library, vis = "pub(crate)")]
impl ScribeMcp {
    #[tool(description = "Generate lorem / placeholder text (paragraphs, sentences, or words). Python preferred; Rust fallback always available.")]
    fn generate_placeholder(
        &self,
        Parameters(params): Parameters<tools::GeneratePlaceholderParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.generate_placeholder(
                &self.sidecar,
                params.unit.as_deref(),
                params.count,
                params.language.as_deref(),
                params.start_with_classic,
                params.seed,
                params.prefer_rust,
            )?))
        })
    }

    #[tool(description = "List custom note templates saved in Scribe (id, name, title, category).")]
    fn list_templates(&self) -> Result<String, String> {
        self.with_store(|store| {
            let templates = store.list_custom_templates()?;
            Ok(tools::json(&serde_json::json!({
                "count": templates.len(),
                "templates": templates,
            })))
        })
    }

    #[tool(
        description = "Parse a `.scribe-templates.json` pack (raw JSON string). Validates schema and returns name, locale, and template summaries. Does not import into the DB."
    )]
    fn parse_template_pack(
        &self,
        Parameters(params): Parameters<tools::ParseTemplatePackParams>,
    ) -> Result<String, String> {
        let pack = scribe_ui::parse_template_pack_str(&params.raw).map_err(|e| e.to_string())?;
        Ok(tools::json(&serde_json::json!({
            "version": pack.version,
            "name": pack.name,
            "locale": pack.locale,
            "count": pack.templates.len(),
            "templates": pack.templates.iter().map(|item| serde_json::json!({
                "name": item.name,
                "title": item.title,
                "description": item.description,
                "categoryId": item.category_id,
            })).collect::<Vec<_>>(),
        })))
    }

    #[tool(description = "Create a new note from a custom template id. Requires writable DB.")]
    fn create_note_from_template(
        &self,
        Parameters(params): Parameters<tools::CreateFromTemplateParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let created = store.create_note_from_template(
                &params.template_id,
                params.folder_id.as_deref(),
                params.title.as_deref(),
            )?;
            Ok(tools::json(&created))
        })
    }

    #[tool(description = "List zip backups in the backup folder (default ~/Documents/Scribe/Backups).")]
    fn list_backups(
        &self,
        Parameters(params): Parameters<tools::BackupDirParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let backups = store.list_backups(params.directory.as_deref())?;
            Ok(tools::json(&serde_json::json!({
                "count": backups.len(),
                "backups": backups,
            })))
        })
    }

    #[tool(description = "Create a library zip backup (DB + documents/assets). Optional directory override.")]
    fn create_backup(
        &self,
        Parameters(params): Parameters<tools::BackupDirParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.create_backup(
                &self.db_path,
                params.directory.as_deref(),
            )?))
        })
    }

    #[tool(
        description = "Import a file from the library files/ sandbox as a new note (docx/md/pdf/xlsx/source/…). Path is relative to files/ (e.g. inbox/report.pdf). Requires writable DB. Optional antivirus gate when ClamAV is installed (scan defaults true)."
    )]
    fn import_path_as_note(
        &self,
        Parameters(params): Parameters<tools::ImportPathAsNoteParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        let rel = params.path.trim();
        if rel.is_empty() {
            return Err("path is required (relative to files/ sandbox)".to_string());
        }
        let docs = self.with_store(|store| store.documents_dir())?;
        let root = scribe_core::storage_fs::ensure_files_root(&docs)?;
        let abs = scribe_core::storage_fs::safe_join_under(&root, rel)?;
        if !abs.is_file() {
            return Err(format!("File not found under files/: {rel}"));
        }
        let scan = params.scan.unwrap_or(true);
        if scan {
            let policy = scribe_core::AntivirusPolicy::default();
            if policy.enabled && policy.scan_on_import {
                scribe_core::gate_import_path(&abs, &policy, Some(&root))?;
            }
        }
        let bytes = std::fs::read(&abs).map_err(|e| e.to_string())?;
        let (default_title, content_json, kind) =
            scribe_core::bytes_to_tiptap_note(&abs, &bytes)?;
        let title = params
            .title
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or(default_title.as_str());
        let note = self.with_store(|store| {
            store.create_note_from_tiptap(title, &content_json, params.folder_id.as_deref())
        })?;
        self.audit_mcp(
            "mcp_tool",
            "import_path_as_note",
            &format!("MCP import_path_as_note: {rel} → {}", note.id),
            Some(serde_json::json!({
                "path": rel,
                "documentId": note.id,
                "kind": format!("{kind:?}"),
            })),
            "ok",
        );
        Ok(tools::json(&serde_json::json!({
            "id": note.id,
            "title": note.title,
            "path": rel,
            "kind": format!("{kind:?}"),
        })))
    }

    #[tool(
        description = "Import every supported file under a files/ sandbox directory as notes (recursive). Skips node_modules/.git/etc. Requires writable DB. Returns imported + failed lists."
    )]
    fn import_folder_as_notes(
        &self,
        Parameters(params): Parameters<tools::ImportFolderAsNotesParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        let rel = params
            .path
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or("");
        let docs = self.with_store(|store| store.documents_dir())?;
        let root = scribe_core::storage_fs::ensure_files_root(&docs)?;
        let abs = scribe_core::storage_fs::safe_join_under(&root, rel)?;
        if !abs.is_dir() {
            return Err(format!(
                "Not a directory under files/: {}",
                if rel.is_empty() { "." } else { rel }
            ));
        }
        let limit = params
            .limit
            .unwrap_or(scribe_core::DEFAULT_FOLDER_IMPORT_MAX_FILES as i64)
            .clamp(1, scribe_core::DEFAULT_FOLDER_IMPORT_MAX_FILES as i64)
            as usize;
        let max_depth = params
            .max_depth
            .unwrap_or(scribe_core::DEFAULT_FOLDER_IMPORT_MAX_DEPTH as i64)
            .clamp(0, 32) as u32;
        let files = scribe_core::collect_importable_files(
            &abs,
            scribe_core::CollectImportFilesOpts {
                max_files: limit,
                max_depth,
                include_apple_packages: false,
                skip_noise_dirs: true,
            },
        )?;
        let scan = params.scan.unwrap_or(true);
        let policy = scribe_core::AntivirusPolicy::default();
        let mut imported = Vec::new();
        let mut failed = Vec::new();
        for path in files {
            let rel_file = path
                .strip_prefix(&root)
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|_| path.display().to_string());
            if scan && policy.enabled && policy.scan_on_import {
                if let Err(error) = scribe_core::gate_import_path(&path, &policy, Some(&root)) {
                    failed.push(serde_json::json!({ "path": rel_file, "error": error }));
                    continue;
                }
            }
            match std::fs::read(&path) {
                Ok(bytes) => match scribe_core::bytes_to_tiptap_note(&path, &bytes) {
                    Ok((title, content_json, kind)) => {
                        match self.with_store(|store| {
                            store.create_note_from_tiptap(
                                &title,
                                &content_json,
                                params.folder_id.as_deref(),
                            )
                        }) {
                            Ok(note) => imported.push(serde_json::json!({
                                "id": note.id,
                                "title": note.title,
                                "path": rel_file,
                                "kind": format!("{kind:?}"),
                            })),
                            Err(error) => {
                                failed.push(serde_json::json!({ "path": rel_file, "error": error }))
                            }
                        }
                    }
                    Err(error) => {
                        failed.push(serde_json::json!({ "path": rel_file, "error": error }))
                    }
                },
                Err(error) => failed.push(serde_json::json!({
                    "path": rel_file,
                    "error": error.to_string(),
                })),
            }
        }
        self.audit_mcp(
            "mcp_tool",
            "import_folder_as_notes",
            &format!(
                "MCP import_folder_as_notes: {} → {} ok / {} failed",
                if rel.is_empty() { "." } else { rel },
                imported.len(),
                failed.len()
            ),
            Some(serde_json::json!({
                "path": rel,
                "imported": imported.len(),
                "failed": failed.len(),
            })),
            "ok",
        );
        Ok(tools::json(&serde_json::json!({
            "path": rel,
            "importedCount": imported.len(),
            "failedCount": failed.len(),
            "imported": imported,
            "failed": failed,
        })))
    }

    #[tool(
        description = "Import base64 file bytes as a new note. fileName extension selects the converter (md/docx/pdf/…). Requires writable DB. Max ~12 MB decoded."
    )]
    fn import_bytes_as_note(
        &self,
        Parameters(params): Parameters<tools::ImportBytesAsNoteParams>,
    ) -> Result<String, String> {
        use base64::Engine;
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        let file_name = params.file_name.trim();
        if file_name.is_empty() || file_name.contains('/') || file_name.contains('\\') {
            return Err("fileName must be a bare filename with extension (no path separators)".into());
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(params.content_base64.trim())
            .map_err(|e| format!("Invalid base64: {e}"))?;
        let path = std::path::Path::new(file_name);
        let (default_title, content_json, kind) =
            scribe_core::bytes_to_tiptap_note(path, &bytes)?;
        let title = params
            .title
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or(default_title.as_str());
        let note = self.with_store(|store| {
            store.create_note_from_tiptap(title, &content_json, params.folder_id.as_deref())
        })?;
        self.audit_mcp(
            "mcp_tool",
            "import_bytes_as_note",
            &format!("MCP import_bytes_as_note: {file_name} → {}", note.id),
            Some(serde_json::json!({
                "fileName": file_name,
                "documentId": note.id,
                "bytes": bytes.len(),
                "kind": format!("{kind:?}"),
            })),
            "ok",
        );
        Ok(tools::json(&serde_json::json!({
            "id": note.id,
            "title": note.title,
            "fileName": file_name,
            "kind": format!("{kind:?}"),
            "bytes": bytes.len(),
        })))
    }

    #[tool(
        description = "Restore an unencrypted scribe-backup-*.zip (replaces local scribe.db + documents/). Requires writable MCP and confirm=true. Reopens the DB afterward. Encrypted archives are app-only."
    )]
    fn import_backup(
        &self,
        Parameters(params): Parameters<tools::ImportBackupParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        if !params.confirm.unwrap_or(false) {
            return Err(
                "Destructive restore — pass confirm: true to replace local scribe.db and documents/"
                    .into(),
            );
        }
        let archive = std::path::PathBuf::from(params.path.trim());
        if !archive.is_file() {
            return Err(format!("Backup zip not found: {}", archive.display()));
        }
        let name = archive
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !name.ends_with(".zip") {
            return Err("path must point to a .zip backup".into());
        }
        let app_dir = self
            .db_path
            .parent()
            .ok_or_else(|| "Invalid db path".to_string())?
            .to_path_buf();
        let docs_hint = self.with_store(|store| store.documents_dir())?;

        // Drop the live SQLite handle before overwriting scribe.db on disk.
        {
            let mut guard = self.store.lock().map_err(|e| e.to_string())?;
            let old = std::mem::replace(&mut *guard, scribe_core::store::ScribeStore::detached_placeholder());
            old.close();
        }

        let result = match scribe_core::store::ScribeStore::import_backup_archive(
            &archive,
            &app_dir,
            &docs_hint,
        ) {
            Ok(value) => value,
            Err(error) => {
                // Best-effort reopen so subsequent tools still work.
                if let Ok(opened) = scribe_core::store::open_scribe_store(Some(self.db_path.clone()))
                {
                    if let Ok(mut guard) = self.store.lock() {
                        *guard = opened.store;
                    }
                }
                return Err(error);
            }
        };

        let opened = scribe_core::store::open_scribe_store(Some(self.db_path.clone()))?;
        {
            let mut guard = self.store.lock().map_err(|e| e.to_string())?;
            *guard = opened.store;
        }

        self.audit_mcp(
            "mcp_tool",
            "import_backup",
            &format!("MCP import_backup: {}", archive.display()),
            Some(serde_json::json!({
                "path": archive.display().to_string(),
                "documentsImported": result.documents_imported,
            })),
            "ok",
        );
        Ok(tools::json(&result))
    }

    #[tool(description = "Local antivirus engine status (ClamAV clamscan/clamdscan). Scribe shells out; no in-process signatures.")]
    fn antivirus_status(&self) -> Result<String, String> {
        Ok(tools::json(&scribe_core::scanner_status()))
    }

    #[tool(
        description = "Scan a files/ sandbox path with the local antivirus gate (ClamAV when installed). Returns the gate decision; does not import."
    )]
    fn scan_import_path(
        &self,
        Parameters(params): Parameters<tools::ScanImportPathParams>,
    ) -> Result<String, String> {
        let rel = params.path.trim();
        if rel.is_empty() {
            return Err("path is required (relative to files/ sandbox)".to_string());
        }
        let docs = self.with_store(|store| store.documents_dir())?;
        let root = scribe_core::storage_fs::ensure_files_root(&docs)?;
        let abs = scribe_core::storage_fs::safe_join_under(&root, rel)?;
        if !abs.is_file() {
            return Err(format!("File not found under files/: {rel}"));
        }
        let policy = scribe_core::AntivirusPolicy::default();
        let decision = scribe_core::gate_import_path(&abs, &policy, Some(&root))?;
        Ok(tools::json(&serde_json::json!({
            "path": rel,
            "decision": decision,
        })))
    }

    #[tool(description = "List media assets for a document (images, SVG, Lottie .json/.lottie) under assets/{id}/.")]
    fn list_document_assets(
        &self,
        Parameters(params): Parameters<tools::IdParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let assets = store.list_document_assets(&params.id)?;
            Ok(tools::json(&serde_json::json!({
                "documentId": params.id,
                "count": assets.len(),
                "assets": assets,
            })))
        })
    }

    #[tool(description = "Rewrite selected text via Local AI (rephrase_professional, summarize_bullets, translate_sk, translate_en, custom_prompt). Does not mutate the note.")]
    fn rewrite_selection(
        &self,
        Parameters(params): Parameters<tools::RewriteSelectionParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.rewrite_selection(
                &self.sidecar,
                &params.text,
                params.mode.as_deref(),
                params.custom_instruction.as_deref(),
            )?))
        })
    }

    #[tool(description = "Analyze plaintext with Local AI (keywords, outline, summary, tone). Text is not saved.")]
    fn analyze_plaintext(
        &self,
        Parameters(params): Parameters<tools::AnalyzePlaintextParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.analyze_plaintext(&self.sidecar, &params.text)?))
        })
    }

    #[tool(description = "Get one cached Local AI artifact by id (journal_summary, library_report, …).")]
    fn get_nlp_artifact(
        &self,
        Parameters(params): Parameters<tools::IdParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let artifact = store
                .get_nlp_artifact(&params.id)?
                .ok_or_else(|| format!("Artifact not found: {}", params.id))?;
            Ok(tools::json(&artifact))
        })
    }

    #[tool(description = "List Scribe libraries and which one is active.")]
    fn list_libraries(&self) -> Result<String, String> {
        self.with_store(|store| {
            let libraries = store.list_libraries()?;
            Ok(tools::json(&serde_json::json!({
                "count": libraries.len(),
                "libraries": libraries,
            })))
        })
    }

    #[tool(description = "Switch the active Scribe library. List/create/search then use this library. Requires writable DB.")]
    fn switch_library(
        &self,
        Parameters(params): Parameters<tools::IdParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        self.with_store(|store| Ok(tools::json(&store.switch_library(&params.id)?)))
    }

    #[tool(description = "Create a new Scribe library (name + optional rootPath). Does not switch to it. Requires writable DB.")]
    fn create_library(
        &self,
        Parameters(params): Parameters<tools::CreateLibraryParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        self.with_store(|store| {
            Ok(tools::json(
                &store.create_library(&params.name, params.root_path.as_deref())?,
            ))
        })
    }

    #[tool(description = "Extract named entities and tag suggestions from a note id or plaintext.")]
    fn extract_entities(
        &self,
        Parameters(params): Parameters<tools::TextOrDocumentParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.extract_entities_text(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
            )?))
        })
    }

    #[tool(description = "Extract wiki links, @mentions, hosts, and URL edges from a note id or plaintext.")]
    fn extract_mentions(
        &self,
        Parameters(params): Parameters<tools::TextOrDocumentParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.extract_mentions_text(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
            )?))
        })
    }

    #[tool(description = "Extract calendar-like date events from a note id or plaintext.")]
    fn extract_dates(
        &self,
        Parameters(params): Parameters<tools::TextOrDocumentParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.extract_dates_text(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
            )?))
        })
    }

    #[tool(description = "List manuscripts (compiled chapter sets) in the active library.")]
    fn list_manuscripts(&self) -> Result<String, String> {
        self.with_store(|store| {
            let manuscripts = store.list_manuscripts()?;
            Ok(tools::json(&serde_json::json!({
                "count": manuscripts.len(),
                "manuscripts": manuscripts,
            })))
        })
    }

    #[tool(description = "Create or update a manuscript (title + ordered chapter document ids) in the active library. Requires writable DB.")]
    fn upsert_manuscript(
        &self,
        Parameters(params): Parameters<tools::UpsertManuscriptParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        self.with_store(|store| {
            let chapter_ids = params.chapter_ids.unwrap_or_default();
            Ok(tools::json(&store.upsert_manuscript(
                params.id.as_deref(),
                &params.title,
                &chapter_ids,
            )?))
        })
    }

    #[tool(description = "List persisted document-chat messages for a note.")]
    fn list_document_chat(
        &self,
        Parameters(params): Parameters<tools::DocumentIdParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let messages = store.list_document_chat_messages(&params.document_id)?;
            Ok(tools::json(&serde_json::json!({
                "documentId": params.document_id,
                "count": messages.len(),
                "messages": messages,
            })))
        })
    }

    #[tool(description = "Append a user or assistant message to a document chat. Requires writable DB.")]
    fn append_document_chat(
        &self,
        Parameters(params): Parameters<tools::AppendDocumentChatParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        self.with_store(|store| {
            let citations = params
                .citations
                .unwrap_or_default()
                .into_iter()
                .map(|item| scribe_core::store_ext::DocumentChatCitation {
                    document_id: item.document_id,
                    title: item.title,
                    snippet: item.snippet,
                })
                .collect::<Vec<_>>();
            Ok(tools::json(&store.append_document_chat_message(
                &params.document_id,
                &params.role,
                &params.text,
                params.action.as_deref(),
                Some(citations.as_slice()),
            )?))
        })
    }

    #[tool(description = "Clear persisted document-chat messages for a note. Requires writable DB.")]
    fn clear_document_chat(
        &self,
        Parameters(params): Parameters<tools::DocumentIdParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        self.with_store(|store| {
            let deleted = store.clear_document_chat_messages(&params.document_id)?;
            Ok(tools::json(&serde_json::json!({
                "documentId": params.document_id,
                "deleted": deleted,
            })))
        })
    }

    #[tool(description = "Join manuscript chapters into one markdown export (export_document per chapterId). Pass manuscript id and/or chapterIds.")]
    fn compile_manuscript(
        &self,
        Parameters(params): Parameters<tools::CompileManuscriptParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.compile_manuscript(
                params.id.as_deref(),
                params.chapter_ids.as_deref(),
                params.title.as_deref(),
            )?))
        })
    }

    #[tool(description = "List saved smart folders (query rules) in the active library.")]
    fn list_smart_folders(&self) -> Result<String, String> {
        self.with_store(|store| {
            let folders = store.list_smart_folders()?;
            Ok(tools::json(&serde_json::json!({
                "count": folders.len(),
                "folders": folders,
            })))
        })
    }

    #[tool(description = "Create or update a smart folder (name + queryRule like tag:work or a search string). Requires writable DB.")]
    fn upsert_smart_folder(
        &self,
        Parameters(params): Parameters<tools::UpsertSmartFolderParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        self.with_store(|store| {
            Ok(tools::json(&store.upsert_smart_folder(
                params.id.as_deref(),
                &params.name,
                &params.query_rule,
                params.icon.as_deref(),
            )?))
        })
    }

    #[tool(description = "Delete a smart folder by id. Requires writable DB.")]
    fn delete_smart_folder(
        &self,
        Parameters(params): Parameters<tools::DeleteIdParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        self.with_store(|store| {
            let deleted = store.delete_smart_folder(&params.id)?;
            Ok(tools::json(&serde_json::json!({
                "ok": deleted,
                "id": params.id,
            })))
        })
    }

    #[tool(description = "Evaluate a smart folder or ad-hoc queryRule (tag:…, folder:…, or FTS).")]
    fn evaluate_smart_folder(
        &self,
        Parameters(params): Parameters<tools::EvaluateSmartFolderParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.evaluate_smart_folder(
                &self.sidecar,
                params.id.as_deref(),
                params.query_rule.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "List unresolved disk/app sync conflicts in the active library.")]
    fn list_sync_conflicts(&self) -> Result<String, String> {
        self.with_store(|store| {
            let conflicts = store.list_sync_conflicts()?;
            Ok(tools::json(&serde_json::json!({
                "count": conflicts.len(),
                "conflicts": conflicts,
            })))
        })
    }

    #[tool(description = "Mark a sync conflict resolved (keep=app|disk). Marks the row only; does not rewrite files. Requires writable DB.")]
    fn resolve_sync_conflict(
        &self,
        Parameters(params): Parameters<tools::ResolveSyncConflictParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        self.with_store(|store| {
            Ok(tools::json(
                &store.resolve_sync_conflict(&params.id, &params.keep)?,
            ))
        })
    }

    #[tool(description = "Split a note or plaintext into overlapping chunks (sidecar chunk_text). Useful for citations / document chat.")]
    fn chunk_text(
        &self,
        Parameters(params): Parameters<tools::ChunkTextParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.chunk_text(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.max_chars,
                params.overlap,
                params.max_chunks,
            )?))
        })
    }

    #[tool(description = "NLP outline from numbered / ALL CAPS / heading-like sections (sidecar extract_outline). Complements get_document_outline.")]
    fn extract_outline(
        &self,
        Parameters(params): Parameters<tools::ExtractOutlineNlpParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.extract_outline_nlp(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "OCR text from a document image asset (list_document_assets + tesseract). Pass documentId and fileName or path.")]
    fn extract_asset_ocr(
        &self,
        Parameters(params): Parameters<tools::ExtractAssetOcrParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.extract_asset_ocr(
                &params.document_id,
                params.file_name.as_deref(),
                params.path.as_deref(),
            )?))
        })
    }

    #[tool(description = "Library find/replace. Defaults to dryRun=true. To write, pass dryRun=false, replacement, and preferably documentIds or folderId.")]
    fn library_find_replace(
        &self,
        Parameters(params): Parameters<tools::LibraryFindReplaceParams>,
    ) -> Result<String, String> {
        let dry_run = params.dry_run.unwrap_or(true);
        if !dry_run && !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        self.with_store(|store| {
            Ok(tools::json(&store.library_find_replace(
                &params.query,
                params.replacement.as_deref(),
                Some(dry_run),
                params.folder_id.as_deref(),
                params.document_ids.as_deref(),
                params.match_case,
            )?))
        })
    }

    #[tool(description = "Answer a question on one note and persist user + assistant turns in one call. Requires writable DB.")]
    fn document_answer_and_save(
        &self,
        Parameters(params): Parameters<tools::DocumentAnswerParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        self.with_store(|store| {
            Ok(tools::json(&store.document_answer_and_save(
                &self.sidecar,
                &params.id,
                &params.question,
            )?))
        })
    }

    #[tool(
        description = "LAN capture endpoint hint (detected IP + default port + Inbox folder name). Does not start the capture HTTP server — use the Scribe app for that."
    )]
    fn capture_endpoint_hint(&self) -> Result<String, String> {
        Ok(tools::json(&serde_json::json!({
            "lanIp": scribe_capture::detect_lan_ip(),
            "defaultPort": scribe_capture::DEFAULT_PORT,
            "inboxFolderName": scribe_capture::INBOX_FOLDER_NAME,
        })))
    }

    #[tool(
        description = "Disk sync defaults: Documents/Scribe path, .scribe extension, and meta keys used by folder sync."
    )]
    fn disk_sync_info(&self) -> Result<String, String> {
        Ok(tools::json(&serde_json::json!({
            "defaultDocumentsDir": scribe_sync::default_documents_dir().display().to_string(),
            "fileExtension": scribe_sync::FILE_EXTENSION,
            "metaDocumentsDir": scribe_sync::META_DOCUMENTS_DIR,
            "metaDocumentsDirGranted": scribe_sync::META_DOCUMENTS_DIR_GRANTED,
        })))
    }

    #[tool(
        description = "Default toast notification settings (position, durations, stack behavior). Canonical from scribe-toast."
    )]
    fn toast_defaults(&self) -> Result<String, String> {
        Ok(tools::json(&scribe_toast::default_toast_settings()))
    }

    #[tool(
        description = "Normalize / clamp a toast settings JSON object (partial OK). Returns safe settings the app would apply."
    )]
    fn normalize_toast_settings_mcp(
        &self,
        Parameters(params): Parameters<tools::NormalizeToastSettingsParams>,
    ) -> Result<String, String> {
        let settings = scribe_toast::toast_settings_from_json(&params.raw)?;
        Ok(tools::json(&settings))
    }
}
