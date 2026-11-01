use crate::server::ScribeMcp;
use crate::tools;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::{tool, tool_router};
use scribe_core::store::{JournalSlot, JournalSummaryInput};


#[tool_router(router = router_journal, vis = "pub(crate)")]
impl ScribeMcp {
    #[tool(description = "Summarize journal entries in a date range (or explicit document ids). Requires Local AI.")]
    fn journal_summary(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::JournalSummaryParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let summary = store.journal_summary(
                &self.sidecar,
                &JournalSummaryInput {
                    from_date: params.from_date,
                    to_date: params.to_date,
                    journal_folder_id: params.journal_folder_id,
                    document_ids: params.document_ids,
                },
            )?;
            Ok(tools::json(&summary))
        })
    }

    #[tool(description = "Summarize one document using Local AI. Requires Local AI enabled.")]
    fn summarize_document(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::SummarizeDocumentParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let summary = store.summarize_document(&self.sidecar, &params.id, params.max_sentences)?;
            Ok(tools::json(&summary))
        })
    }

    #[tool(description = "Suggest tags and entities for a document using Local AI.")]
    fn suggest_tags(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::IdParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let suggestions = store.suggest_tags(&self.sidecar, &params.id)?;
            Ok(tools::json(&suggestions))
        })
    }

    #[tool(description = "Generate an AI overview report of the entire library (markdown + stats).")]
    fn library_report(&self) -> Result<String, String> {
        self.with_store(|store| {
            let report = store.library_report(&self.sidecar)?;
            Ok(tools::json(&report))
        })
    }

    #[tool(description = "Extract open tasks from multiple journal documents.")]
    fn journal_tasks(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::JournalTasksParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let tasks = store.journal_tasks(&self.sidecar, &params.document_ids)?;
            Ok(tools::json(&serde_json::json!({
                "count": tasks.len(),
                "tasks": tasks,
            })))
        })
    }

    #[tool(description = "List open tasks (unchecked checkboxes, plus NLP phrases when includePhrases is true) across the library.")]
    fn list_open_tasks(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::ListOpenTasksParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let include_phrases = params.include_phrases.unwrap_or(false);
            let tasks = store.list_open_tasks(
                &self.sidecar,
                params.folder_id.as_deref(),
                params.limit.unwrap_or(200),
                include_phrases,
            )?;
            Ok(tools::json(&serde_json::json!({
                "count": tasks.len(),
                "includePhrases": include_phrases,
                "tasks": tasks,
            })))
        })
    }

    #[tool(
        description = "Open tasks grouped into agenda buckets overdue|today|upcoming|later by due hint (YYYY-MM-DD). Same scan as list_open_tasks."
    )]
    fn list_tasks_agenda(
        &self,
        Parameters(params): Parameters<tools::ListTasksAgendaParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let include_phrases = params.include_phrases.unwrap_or(false);
            let tasks = store.list_open_tasks(
                &self.sidecar,
                params.folder_id.as_deref(),
                params.limit.unwrap_or(200),
                include_phrases,
            )?;
            let (default_now, default_offset) = scribe_core::local_now_ms_and_offset_east();
            let now_ms = params.now_ms.unwrap_or(default_now);
            let offset = params.offset_minutes_east.unwrap_or(default_offset);
            let buckets = scribe_core::group_tasks_by_agenda(&tasks, now_ms, offset);
            let total: usize = buckets.iter().map(|b| b.items.len()).sum();
            Ok(tools::json(&serde_json::json!({
                "count": total,
                "includePhrases": include_phrases,
                "nowMs": now_ms,
                "offsetMinutesEast": offset,
                "buckets": buckets,
            })))
        })
    }

    #[tool(
        description = "Export the first TipTap codeBlock from a note as source text plus language extension (Whats New source export)."
    )]
    fn export_document_source(
        &self,
        Parameters(params): Parameters<tools::ExportDocumentSourceParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let doc = store
                .get_document_scoped(&params.id, true, self.vault_scope)?
                .ok_or_else(|| format!("Document not found: {}", params.id))?;
            let content_json = doc
                .content_json
                .as_deref()
                .ok_or_else(|| "Document body unavailable (vault scope?)".to_string())?;
            let Some((language, code)) = scribe_core::extract_first_code_block(content_json) else {
                return Ok(tools::json(&serde_json::json!({
                    "id": doc.id,
                    "title": doc.title,
                    "found": false,
                })));
            };
            let extension = scribe_core::extension_for_language(language.as_deref());
            let safe_title: String = doc
                .title
                .chars()
                .map(|c| {
                    if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                        c
                    } else {
                        '_'
                    }
                })
                .collect();
            let filename = format!("{safe_title}.{extension}");
            Ok(tools::json(&serde_json::json!({
                "id": doc.id,
                "title": doc.title,
                "found": true,
                "language": language,
                "extension": extension,
                "filename": filename,
                "code": code,
            })))
        })
    }

    #[tool(description = "Get today's journal note, or create it. Slot: day (default), morning, or evening. Date YYYY-MM-DD defaults to today.")]
    fn get_or_create_journal(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::GetOrCreateJournalParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let slot = JournalSlot::parse(params.slot.as_deref())?;
            let note = store.get_or_create_journal(slot, params.date.as_deref())?;
            Ok(tools::json(&note))
        })
    }

    #[tool(description = "Index one document for semantic search (embeddings).")]
    fn index_document(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::IdParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let result = store.index_document(&self.sidecar, &params.id)?;
            Ok(tools::json(&result))
        })
    }

    #[tool(description = "Re-index all documents for semantic search.")]
    fn index_all_documents(&self) -> Result<String, String> {
        self.with_store(|store| {
            let result = store.index_all_documents(&self.sidecar)?;
            Ok(tools::json(&result))
        })
    }

    #[tool(description = "Move a document to trash (soft delete).")]
    fn trash_document(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::IdParams,
        >,
    ) -> Result<String, String> {
        let result = self.with_store(|store| Ok(tools::json(&store.trash_document(&params.id)?)))?;
        self.audit_mcp(
            "mcp_tool",
            "trash_document",
            &format!("MCP trash_document: {}", params.id),
            Some(serde_json::json!({ "id": params.id })),
            "ok",
        );
        Ok(result)
    }

    #[tool(description = "Rename a document title.")]
    fn rename_document(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::RenameDocumentParams,
        >,
    ) -> Result<String, String> {
        let result = self.with_store(|store| {
            Ok(tools::json(&store.rename_document(&params.id, &params.title)?))
        })?;
        self.audit_mcp(
            "mcp_tool",
            "rename_document",
            &format!("MCP rename_document: {}", params.id),
            Some(serde_json::json!({ "id": params.id, "title": params.title })),
            "ok",
        );
        Ok(result)
    }

    #[tool(description = "Replace document body with plain text (creates a revision when content changes).")]
    fn replace_document_content(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::ReplaceContentParams,
        >,
    ) -> Result<String, String> {
        let result = self.with_store(|store| {
            Ok(tools::json(&store.replace_document_content(&params.id, &params.content)?))
        })?;
        self.audit_mcp(
            "mcp_tool",
            "replace_document_content",
            &format!("MCP replace_document_content: {}", params.id),
            Some(serde_json::json!({ "id": params.id })),
            "ok",
        );
        Ok(result)
    }

    #[tool(description = "Mark a document as favorite or remove favorite.")]
    fn set_document_favorite(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::SetFlagParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.set_document_favorite(&params.id, params.value)?))
        })
    }

    #[tool(description = "Pin or unpin a document.")]
    fn set_document_pinned(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::SetFlagParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.set_document_pinned(&params.id, params.value)?))
        })
    }

    #[tool(description = "List cached Local AI artifacts (journal summaries, library reports).")]
    fn list_nlp_artifacts(
        &self,
        Parameters(params): Parameters<tools::ListArtifactsParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let artifacts = store.list_nlp_artifacts(params.kind.as_deref(), params.limit.unwrap_or(20))?;
            Ok(tools::json(&serde_json::json!({
                "count": artifacts.len(),
                "artifacts": artifacts,
            })))
        })
    }

    #[tool(description = "Duplicate a document (optional new title). Requires writable DB.")]
    fn duplicate_document(
        &self,
        Parameters(params): Parameters<tools::DuplicateDocumentParams>,
    ) -> Result<String, String> {
        let result = self.with_store(|store| {
            Ok(tools::json(&store.duplicate_document(&params.id, params.title.as_deref())?))
        })?;
        self.audit_mcp(
            "mcp_tool",
            "duplicate_document",
            &format!("MCP duplicate_document: {}", params.id),
            Some(serde_json::json!({ "id": params.id })),
            "ok",
        );
        Ok(result)
    }

    #[tool(description = "Permanently delete all trashed documents.")]
    fn empty_trash(&self) -> Result<String, String> {
        let result = self.with_store(|store| Ok(tools::json(&store.empty_trash()?)))?;
        self.audit_mcp(
            "mcp_tool",
            "empty_trash",
            "MCP empty_trash",
            None,
            "ok",
        );
        Ok(result)
    }

    #[tool(description = "Delete a folder (trashes documents in the subtree).")]
    fn delete_folder(
        &self,
        Parameters(params): Parameters<tools::IdParams>,
    ) -> Result<String, String> {
        self.with_store(|store| Ok(tools::json(&store.delete_folder(&params.id)?)))
    }

    #[tool(description = "Move a folder (omit parentId for root).")]
    fn move_folder(
        &self,
        Parameters(params): Parameters<tools::MoveFolderParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.move_folder(&params.id, params.parent_id.as_deref())?))
        })
    }

    #[tool(description = "Pin or unpin a folder.")]
    fn set_folder_pinned(
        &self,
        Parameters(params): Parameters<tools::SetFlagParams>,
    ) -> Result<String, String> {
        self.with_store(|store| Ok(tools::json(&store.set_folder_pinned(&params.id, params.value)?)))
    }

    #[tool(description = "Start a comment thread on a document.")]
    fn create_comment_thread(
        &self,
        Parameters(params): Parameters<tools::CreateCommentThreadParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.create_comment_thread(
                &params.document_id,
                params.quote.as_deref().unwrap_or(""),
                &params.body,
                params.author.as_deref(),
            )?))
        })
    }

    #[tool(description = "Reply to a comment thread.")]
    fn add_comment_reply(
        &self,
        Parameters(params): Parameters<tools::AddCommentReplyParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.add_comment_reply(
                &params.thread_id,
                &params.body,
                params.author.as_deref(),
            )?))
        })
    }

    #[tool(description = "Export a document as markdown or plain text.")]
    fn export_document(
        &self,
        Parameters(params): Parameters<tools::ExportDocumentParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.export_document(
                &params.id,
                params.format.as_deref().unwrap_or("markdown"),
            )?))
        })
    }

    #[tool(description = "Toggle or set a checkbox/task by its text.")]
    fn toggle_task(
        &self,
        Parameters(params): Parameters<tools::ToggleTaskParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.toggle_task(&params.id, &params.text, params.checked)?))
        })
    }

    #[tool(description = "Heading outline / TOC for a document.")]
    fn get_document_outline(
        &self,
        Parameters(params): Parameters<tools::IdParams>,
    ) -> Result<String, String> {
        self.with_store(|store| Ok(tools::json(&store.get_document_outline(&params.id)?)))
    }

    #[tool(description = "Wiki links ([[label]]) whose target document is missing.")]
    fn list_unresolved_wiki_links(
        &self,
        Parameters(params): Parameters<tools::LimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let links = store.list_unresolved_wiki_links(params.limit.unwrap_or(50))?;
            Ok(tools::json(&serde_json::json!({
                "count": links.len(),
                "links": links,
            })))
        })
    }

    #[tool(description = "Most connected notes by backlinks and outgoing wiki links.")]
    fn list_graph_hubs(
        &self,
        Parameters(params): Parameters<tools::LimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let hubs = store.list_graph_hubs(params.limit.unwrap_or(12))?;
            Ok(tools::json(&serde_json::json!({
                "count": hubs.len(),
                "hubs": hubs,
            })))
        })
    }
}
