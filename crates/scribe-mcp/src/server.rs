use crate::tools;
use std::future::ready;
use std::path::PathBuf;
use std::sync::Mutex;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{
    ErrorData, GetPromptResult, ListResourceTemplatesResult, ListResourcesResult, PromptMessage,
    ReadResourceRequestParams, ReadResourceResponse, ReadResourceResult, Resource, ResourceContents,
    ResourceTemplate, Role, ServerCapabilities, ServerInfo,
};
use rmcp::service::RequestContext;
use rmcp::{
    prompt, prompt_handler, prompt_router, tool, tool_handler, tool_router, RoleServer, ServerHandler,
};
use scribe_core::nlp::{resolve_script_path, NlpSidecar};
use scribe_core::store::{
    open_scribe_store, JournalSlot, JournalSummaryInput, ScribeStore, SearchFilter,
};
use scribe_core::vault::McpVaultScope;

pub struct ScribeMcp {
    store: Mutex<ScribeStore>,
    sidecar: NlpSidecar,
    pub db_path: PathBuf,
    pub writable: bool,
    pub vault_scope: McpVaultScope,
}

impl ScribeMcp {
    pub fn new() -> anyhow::Result<Self> {
        let opened = open_scribe_store(None).map_err(|error| anyhow::anyhow!(error))?;
        let vault_scope = McpVaultScope::from_env();
        eprintln!(
            "[scribe-mcp] vault scope={} (SCRIBE_MCP_SCOPE)",
            vault_scope.as_str()
        );
        Ok(Self {
            store: Mutex::new(opened.store),
            sidecar: NlpSidecar::new(resolve_script_path()),
            db_path: opened.db_path,
            writable: opened.writable,
            vault_scope,
        })
    }

    fn with_store<T, F: FnOnce(&ScribeStore) -> Result<T, String>>(&self, f: F) -> Result<T, String> {
        let guard = self.store.lock().map_err(|e| e.to_string())?;
        f(&guard)
    }

    fn filter_hits(
        &self,
        store: &ScribeStore,
        hits: Vec<scribe_core::db::SearchHit>,
    ) -> Result<Vec<scribe_core::db::SearchHit>, String> {
        store.filter_search_hits_for_scope(hits, self.vault_scope)
    }
}

fn search_filter(
    folder_id: Option<String>,
    tag: Option<String>,
    from_date: Option<String>,
    to_date: Option<String>,
) -> SearchFilter {
    SearchFilter {
        folder_id,
        tag,
        from_date,
        to_date,
    }
}

#[tool_router]
impl ScribeMcp {
    #[tool(description = "Health check: database path, writable flag, sample counts.")]
    fn scribe_status(&self) -> Result<String, String> {
        self.with_store(|store| {
            let docs = store.list_documents(None, Some(1))?;
            let graph = store.list_link_graph()?;
            let active_library = store.active_library().ok();
            Ok(tools::json(&serde_json::json!({
                "ok": true,
                "dbPath": self.db_path,
                "writable": self.writable,
                "vaultScope": self.vault_scope.as_str(),
                "sampleDocumentCount": docs.len(),
                "edgeCount": graph.edges.len(),
                "orphanCount": graph.orphans.len(),
                "activeLibrary": active_library,
            })))
        })
    }

    #[tool(description = "Hybrid FTS + semantic search when Local AI is enabled; otherwise FTS. Prefer this over separate calls.")]
    fn search_documents(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::SearchParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let filter = search_filter(
                params.folder_id,
                params.tag,
                params.from_date,
                params.to_date,
            );
            let hits = store.search_with_mode(
                &self.sidecar,
                &params.query,
                params.limit.unwrap_or(10),
                Some("hybrid"),
                Some(&filter),
            )?;
            let hits = self.filter_hits(store, hits)?;
            Ok(tools::json(&serde_json::json!({
                "query": params.query,
                "count": hits.len(),
                "hits": hits,
                "mode": "hybrid",
                "vaultScope": self.vault_scope.as_str(),
            })))
        })
    }

    #[tool(description = "Full-text search only (no embeddings).")]
    fn search_documents_fts(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::SearchParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let hits = store.search_documents_fts(&params.query, params.limit.unwrap_or(10))?;
            let hits = self.filter_hits(store, hits)?;
            Ok(tools::json(&serde_json::json!({
                "query": params.query,
                "count": hits.len(),
                "hits": hits,
                "mode": "fts",
                "vaultScope": self.vault_scope.as_str(),
            })))
        })
    }

    #[tool(description = "Semantic search using embeddings (requires Local AI enabled and indexed library).")]
    fn semantic_search(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::SearchParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let hits = store.semantic_search_documents(&self.sidecar, &params.query, params.limit.unwrap_or(10))?;
            let hits = self.filter_hits(store, hits)?;
            Ok(tools::json(&serde_json::json!({
                "query": params.query,
                "count": hits.len(),
                "hits": hits,
                "mode": "semantic",
                "vaultScope": self.vault_scope.as_str(),
            })))
        })
    }

    #[tool(description = "Find documents semantically similar to a given document id.")]
    fn similar_documents(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::IdLimitParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let hits = store.similar_documents_for(&params.id, params.limit.unwrap_or(8))?;
            let hits = self.filter_hits(store, hits)?;
            Ok(tools::json(&serde_json::json!({
                "documentId": params.id,
                "count": hits.len(),
                "hits": hits,
                "vaultScope": self.vault_scope.as_str(),
            })))
        })
    }

    #[tool(description = "Extract open tasks from a document (checkboxes + NLP phrases when enabled).")]
    fn extract_document_tasks(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::IdParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let tasks = store.extract_document_tasks(&self.sidecar, &params.id)?;
            Ok(tools::json(&serde_json::json!({
                "documentId": params.id,
                "count": tasks.len(),
                "tasks": tasks,
            })))
        })
    }

    #[tool(description = "Local AI sidecar status: enabled flag, model, index counts.")]
    fn nlp_status(&self) -> Result<String, String> {
        self.with_store(|store| {
            let status = store.nlp_status(&self.sidecar)?;
            Ok(tools::json(&status))
        })
    }

    #[tool(description = "Find documents whose title matches a string (case-insensitive).")]
    fn find_documents_by_title(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::TitleParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let docs = store.find_documents_by_title(&params.title, params.limit.unwrap_or(10))?;
            Ok(tools::json(&serde_json::json!({
                "title": params.title,
                "count": docs.len(),
                "documents": docs,
            })))
        })
    }

    #[tool(description = "Load one document as plain text. Optionally include raw TipTap JSON.")]
    fn get_document(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::GetDocumentParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let doc = store
                .get_document_scoped(
                    &params.id,
                    params.include_json.unwrap_or(false),
                    self.vault_scope,
                )?
                .ok_or_else(|| format!("Document not found: {}", params.id))?;
            Ok(tools::json(&doc))
        })
    }

    #[tool(description = "List recent open documents. Optional folder filter.")]
    fn list_documents(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::ListDocumentsParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let documents = store.list_documents(
                params.folder_id.as_deref(),
                params.limit,
            )?;
            Ok(tools::json(&serde_json::json!({
                "count": documents.len(),
                "documents": documents,
            })))
        })
    }

    #[tool(description = "List all folders.")]
    fn list_folders(&self) -> Result<String, String> {
        self.with_store(|store| {
            let folders = store.list_folders()?;
            Ok(tools::json(&serde_json::json!({
                "count": folders.len(),
                "folders": folders,
            })))
        })
    }

    #[tool(description = "Documents that link TO this document via [[wiki links]].")]
    fn list_backlinks(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::IdParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let documents = store.list_backlinks(&params.id)?;
            Ok(tools::json(&serde_json::json!({
                "id": params.id,
                "count": documents.len(),
                "documents": documents,
            })))
        })
    }

    #[tool(description = "Documents this note links TO via [[wiki links]].")]
    fn list_outgoing_links(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::IdParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let documents = store.list_outgoing_links(&params.id)?;
            Ok(tools::json(&serde_json::json!({
                "id": params.id,
                "count": documents.len(),
                "documents": documents,
            })))
        })
    }

    #[tool(description = "Full wiki-link graph: edges and orphan notes.")]
    fn list_link_graph(&self) -> Result<String, String> {
        self.with_store(|store| {
            let graph = store.list_link_graph()?;
            Ok(tools::json(&serde_json::json!({
                "edgeCount": graph.edges.len(),
                "orphanCount": graph.orphans.len(),
                "edges": graph.edges,
                "orphans": graph.orphans,
            })))
        })
    }

    #[tool(description = "Create a new note from plain text. Requires writable DB.")]
    fn create_note(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::CreateNoteParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let note = store.create_note(
                &params.title,
                params.content.as_deref(),
                params.folder_id.as_deref(),
            )?;
            Ok(tools::json(&note))
        })
    }

    #[tool(description = "Append plain text paragraphs to an existing note.")]
    fn append_to_note(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::AppendNoteParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let note = store.append_to_note(&params.id, &params.text)?;
            Ok(tools::json(&note))
        })
    }

    #[tool(description = "List favorite documents.")]
    fn list_favorites(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::LimitParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let documents = store.list_favorites(params.limit.unwrap_or(50))?;
            Ok(tools::json(&serde_json::json!({ "count": documents.len(), "documents": documents })))
        })
    }

    #[tool(description = "List pinned documents.")]
    fn list_pinned(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::LimitParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let documents = store.list_pinned(params.limit.unwrap_or(50))?;
            Ok(tools::json(&serde_json::json!({ "count": documents.len(), "documents": documents })))
        })
    }

    #[tool(description = "List trashed documents.")]
    fn list_trashed_documents(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::LimitParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let documents = store.list_trashed_documents(params.limit.unwrap_or(50))?;
            Ok(tools::json(&serde_json::json!({ "count": documents.len(), "documents": documents })))
        })
    }

    #[tool(description = "Restore a trashed document.")]
    fn restore_document(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::IdParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.restore_document(&params.id)?))
        })
    }

    #[tool(description = "Permanently delete a trashed document.")]
    fn purge_document(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::IdParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| Ok(tools::json(&store.purge_document(&params.id)?)))
    }

    #[tool(description = "List all tags with document counts.")]
    fn list_tags(&self) -> Result<String, String> {
        self.with_store(|store| {
            let tags = store.list_tags()?;
            Ok(tools::json(&serde_json::json!({ "count": tags.len(), "tags": tags })))
        })
    }

    #[tool(description = "Find documents with an exact tag.")]
    fn search_by_tag(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::TagParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let documents = store.search_by_tag(&params.tag, params.limit.unwrap_or(50))?;
            Ok(tools::json(&serde_json::json!({
                "tag": params.tag,
                "count": documents.len(),
                "documents": documents,
            })))
        })
    }

    #[tool(description = "Replace tags on a document.")]
    fn set_document_tags(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::SetTagsParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| Ok(tools::json(&store.set_document_tags(&params.id, &params.tags)?)))
    }

    #[tool(description = "Add a single tag to a document (keeps existing tags).")]
    fn add_document_tag(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::AddTagParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| Ok(tools::json(&store.add_document_tag(&params.id, &params.tag)?)))
    }

    #[tool(description = "Remove a single tag from a document.")]
    fn remove_document_tag(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::AddTagParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| Ok(tools::json(&store.remove_document_tag(&params.id, &params.tag)?)))
    }

    #[tool(description = "Create a folder.")]
    fn create_folder(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::CreateFolderParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.create_folder(
                &params.name,
                params.parent_id.as_deref(),
            )?))
        })
    }

    #[tool(description = "Rename a folder.")]
    fn rename_folder(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::RenameFolderParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.rename_folder(&params.id, &params.name)?))
        })
    }

    #[tool(description = "Move a document to a folder (omit folderId for root).")]
    fn move_document_to_folder(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::MoveDocumentParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.move_document_to_folder(
                &params.document_id,
                params.folder_id.as_deref(),
            )?))
        })
    }

    #[tool(description = "List comment threads on a document.")]
    fn list_comment_threads(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::DocumentIdParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let threads = store.list_comment_threads(&params.document_id)?;
            Ok(tools::json(&serde_json::json!({
                "documentId": params.document_id,
                "count": threads.len(),
                "threads": threads,
            })))
        })
    }

    #[tool(description = "Search comments across the library.")]
    fn search_comments(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::SearchParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let hits = store.search_comments(&params.query, params.limit.unwrap_or(20))?;
            Ok(tools::json(&serde_json::json!({
                "query": params.query,
                "count": hits.len(),
                "hits": hits,
            })))
        })
    }

    #[tool(description = "List revision snapshots for a document.")]
    fn list_document_revisions(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::DocumentLimitParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let revisions = store.list_document_revisions(&params.document_id, params.limit.unwrap_or(20))?;
            Ok(tools::json(&serde_json::json!({
                "documentId": params.document_id,
                "count": revisions.len(),
                "revisions": revisions,
            })))
        })
    }

    #[tool(description = "Load one revision snapshot.")]
    fn get_document_revision(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::RevisionParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let revision = store
                .get_document_revision(&params.revision_id)?
                .ok_or_else(|| format!("Revision not found: {}", params.revision_id))?;
            Ok(tools::json(&revision))
        })
    }

    #[tool(description = "Restore a document to a revision snapshot. Current content is saved as a new revision. Requires writable DB.")]
    fn restore_document_revision(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::RevisionParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| Ok(tools::json(&store.restore_document_revision(&params.revision_id)?)))
    }

    #[tool(description = "Unified search with mode: hybrid (default), semantic, or fts.")]
    fn search(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::SearchModeParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let filter = search_filter(
                params.folder_id,
                params.tag,
                params.from_date,
                params.to_date,
            );
            let hits = store.search_with_mode(
                &self.sidecar,
                &params.query,
                params.limit.unwrap_or(10),
                params.mode.as_deref(),
                Some(&filter),
            )?;
            let hits = self.filter_hits(store, hits)?;
            Ok(tools::json(&serde_json::json!({
                "query": params.query,
                "mode": params.mode.unwrap_or_else(|| "hybrid".to_string()),
                "count": hits.len(),
                "hits": hits,
                "vaultScope": self.vault_scope.as_str(),
            })))
        })
    }

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
        self.with_store(|store| Ok(tools::json(&store.trash_document(&params.id)?)))
    }

    #[tool(description = "Rename a document title.")]
    fn rename_document(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::RenameDocumentParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.rename_document(&params.id, &params.title)?))
        })
    }

    #[tool(description = "Replace document body with plain text (creates a revision when content changes).")]
    fn replace_document_content(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::ReplaceContentParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.replace_document_content(&params.id, &params.content)?))
        })
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
        self.with_store(|store| {
            Ok(tools::json(&store.duplicate_document(&params.id, params.title.as_deref())?))
        })
    }

    #[tool(description = "Permanently delete all trashed documents.")]
    fn empty_trash(&self) -> Result<String, String> {
        self.with_store(|store| Ok(tools::json(&store.empty_trash()?)))
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

    #[tool(description = "Answer a question from the local library (hybrid search + Local AI). Requires Local AI.")]
    fn library_answer(
        &self,
        Parameters(params): Parameters<tools::LibraryAnswerParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.library_answer(
                &self.sidecar,
                &params.question,
                params.limit,
            )?))
        })
    }

    #[tool(description = "Full Local AI analysis of a note: keywords, outline, summary, tone, dates, mentions.")]
    fn document_analysis(
        &self,
        Parameters(params): Parameters<tools::IdParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.document_analysis(&self.sidecar, &params.id)?))
        })
    }

    #[tool(description = "Suggest a title (and slug) for a document using Local AI.")]
    fn suggest_title(
        &self,
        Parameters(params): Parameters<tools::IdParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.suggest_document_title(
                &self.sidecar,
                &params.id,
            )?))
        })
    }

    #[tool(description = "Find near-duplicate notes in the library (Local AI).")]
    fn find_duplicates(
        &self,
        Parameters(params): Parameters<tools::LimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.find_duplicate_documents(
                &self.sidecar,
                params.limit,
            )?))
        })
    }

    #[tool(description = "Suggest [[wiki links]] for phrases in a document that match other note titles.")]
    fn suggest_wiki_links(
        &self,
        Parameters(params): Parameters<tools::IdLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.suggest_wiki_links(
                &self.sidecar,
                &params.id,
                params.limit,
            )?))
        })
    }

    #[tool(description = "Extract calendar-like date events from recent notes. Optional fromDate/toDate (YYYY-MM-DD).")]
    fn calendar_events(
        &self,
        Parameters(params): Parameters<tools::CalendarEventsParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.calendar_events(
                &self.sidecar,
                params.limit,
                params.from_date.as_deref(),
                params.to_date.as_deref(),
            )?))
        })
    }

    #[tool(description = "Spellcheck a document (SK/EN dictionaries via Local AI sidecar).")]
    fn spellcheck(
        &self,
        Parameters(params): Parameters<tools::IdParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.spellcheck_document(
                &self.sidecar,
                &params.id,
            )?))
        })
    }

    #[tool(description = "Extract keywords and keyphrases from a document.")]
    fn extract_keywords(
        &self,
        Parameters(params): Parameters<tools::KeywordLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.extract_document_keywords(
                &self.sidecar,
                &params.id,
                params.limit,
            )?))
        })
    }

    #[tool(description = "Analyze sentiment / tone of a document.")]
    fn analyze_sentiment(
        &self,
        Parameters(params): Parameters<tools::IdParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.analyze_document_sentiment(
                &self.sidecar,
                &params.id,
            )?))
        })
    }

    #[tool(description = "Answer a question using one document only (chunked passages + Local AI). Optional context for follow-ups.")]
    fn document_answer(
        &self,
        Parameters(params): Parameters<tools::DocumentAnswerParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let context = params.context.as_ref().map(|messages| {
                messages
                    .iter()
                    .map(|message| {
                        serde_json::json!({
                            "role": message.role,
                            "text": message.text,
                        })
                    })
                    .collect::<Vec<_>>()
            });
            Ok(tools::json(&store.document_answer(
                &self.sidecar,
                &params.id,
                &params.question,
                context.as_deref(),
            )?))
        })
    }

    #[tool(description = "Summarize what changed between two plain-text versions (Local AI diff bullets).")]
    fn summarize_diff(
        &self,
        Parameters(params): Parameters<tools::SummarizeDiffParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.summarize_diff(
                &self.sidecar,
                &params.old_text,
                &params.new_text,
                params.max_bullets,
            )?))
        })
    }

    #[tool(description = "Summarize changes between a saved revision and the current document body.")]
    fn summarize_revision_diff(
        &self,
        Parameters(params): Parameters<tools::SummarizeRevisionDiffParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.summarize_revision_diff(
                &self.sidecar,
                &params.id,
                &params.revision_id,
                params.max_bullets,
            )?))
        })
    }

    #[tool(description = "Check which expected template sections are missing or filled in a document.")]
    fn template_fill_hints(
        &self,
        Parameters(params): Parameters<tools::TemplateFillHintsParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.template_fill_hints(
                &self.sidecar,
                &params.id,
                params.expected_sections,
            )?))
        })
    }

    #[tool(description = "Suggest a folder (and related organize hints) for a document based on content and existing folders.")]
    fn suggest_organize(
        &self,
        Parameters(params): Parameters<tools::IdLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.suggest_organize_document(
                &self.sidecar,
                &params.id,
                params.limit,
            )?))
        })
    }

    #[tool(description = "Reading time / readability stats for a document (Local AI).")]
    fn reading_stats(
        &self,
        Parameters(params): Parameters<tools::IdParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.document_reading_stats(
                &self.sidecar,
                &params.id,
            )?))
        })
    }

    #[tool(description = "Detect document language (sk/en/…) via Local AI.")]
    fn detect_language(
        &self,
        Parameters(params): Parameters<tools::IdParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.detect_document_language(
                &self.sidecar,
                &params.id,
            )?))
        })
    }

    #[tool(description = "Expand / rewrite a search query for better hybrid/semantic retrieval.")]
    fn rewrite_query(
        &self,
        Parameters(params): Parameters<tools::RewriteQueryParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.rewrite_search_query(
                &self.sidecar,
                &params.query,
                params.max_expansions,
            )?))
        })
    }

    #[tool(description = "Enable or disable Local AI (NLP) in Scribe settings. Requires writable DB.")]
    fn set_nlp_enabled(
        &self,
        Parameters(params): Parameters<tools::SetNlpEnabledParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (SCRIBE_MCP_WRITE=0)".to_string());
        }
        self.with_store(|store| {
            Ok(tools::json(
                &store.set_nlp_enabled_flag(&self.sidecar, params.enabled)?,
            ))
        })
    }

    #[tool(description = "Set embedding backend: hash (fast, default) or quality (MiniLM). Requires writable DB; reindex after switching.")]
    fn set_embed_backend(
        &self,
        Parameters(params): Parameters<tools::SetEmbedBackendParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (SCRIBE_MCP_WRITE=0)".to_string());
        }
        self.with_store(|store| {
            Ok(tools::json(
                &store.set_nlp_embed_backend(&self.sidecar, &params.backend)?,
            ))
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
            return Err("MCP is read-only (SCRIBE_MCP_WRITE=0)".to_string());
        }
        self.with_store(|store| Ok(tools::json(&store.switch_library(&params.id)?)))
    }

    #[tool(description = "Create a new Scribe library (name + optional rootPath). Does not switch to it. Requires writable DB.")]
    fn create_library(
        &self,
        Parameters(params): Parameters<tools::CreateLibraryParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (SCRIBE_MCP_WRITE=0)".to_string());
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
            return Err("MCP is read-only (SCRIBE_MCP_WRITE=0)".to_string());
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
            return Err("MCP is read-only (SCRIBE_MCP_WRITE=0)".to_string());
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
            return Err("MCP is read-only (SCRIBE_MCP_WRITE=0)".to_string());
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
            return Err("MCP is read-only (SCRIBE_MCP_WRITE=0)".to_string());
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
            return Err("MCP is read-only (SCRIBE_MCP_WRITE=0)".to_string());
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
            return Err("MCP is read-only (SCRIBE_MCP_WRITE=0)".to_string());
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
            return Err("MCP is read-only (SCRIBE_MCP_WRITE=0)".to_string());
        }
        self.with_store(|store| {
            Ok(tools::json(&store.document_answer_and_save(
                &self.sidecar,
                &params.id,
                &params.question,
            )?))
        })
    }
}

#[prompt_router]
impl ScribeMcp {
    #[prompt(description = "Review journal notes for a week using Scribe tools.")]
    fn weekly_journal_review(
        &self,
        Parameters(params): Parameters<tools::DateRangePromptParams>,
    ) -> GetPromptResult {
        let from = params
            .from_date
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "7 days ago as YYYY-MM-DD".to_string());
        let to = params
            .to_date
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "today as YYYY-MM-DD".to_string());
        GetPromptResult::new(vec![PromptMessage::new_text(
            Role::User,
            format!(
                "Review my Scribe journal from {from} to {to}.\n\
                 1. Call get_or_create_journal if today is in range.\n\
                 2. Call list_nlp_artifacts with kind journal_summary — reuse a cached summary if it matches this range.\n\
                 3. Otherwise call journal_summary with fromDate={from} and toDate={to}.\n\
                 4. Call list_open_tasks (optionally includePhrases true).\n\
                 Write a concise weekly review: themes, unfinished tasks, and what to carry forward."
            ),
        )])
        .with_description("Weekly journal review")
    }

    #[prompt(description = "Capture a thought into today's journal note.")]
    fn capture_today(&self) -> GetPromptResult {
        GetPromptResult::new(vec![PromptMessage::new_text(
            Role::User,
            "Capture this into my Scribe daily journal.\n\
             1. Call get_or_create_journal (slot day unless I said morning/evening).\n\
             2. Append the note with append_to_note using the returned id.\n\
             Confirm the document id and quote what you wrote.",
        )])
        .with_description("Write into today's journal")
    }

    #[prompt(description = "Triage open tasks across the library.")]
    fn open_tasks_triage(&self) -> GetPromptResult {
        GetPromptResult::new(vec![PromptMessage::new_text(
            Role::User,
            "Triage open tasks in my Scribe library.\n\
             1. Call list_open_tasks.\n\
             2. Group by document. Suggest what to do today vs later.\n\
             3. If I mark something done, call toggle_task with the document id and task text.\n\
             Do not invent tasks that were not returned.",
        )])
        .with_description("Inbox-zero for checkboxes")
    }

    #[prompt(description = "Inspect wiki graph health: hubs and broken [[links]].")]
    fn wiki_health(&self) -> GetPromptResult {
        GetPromptResult::new(vec![PromptMessage::new_text(
            Role::User,
            "Audit my Scribe wiki graph.\n\
             1. Call list_graph_hubs.\n\
             2. Call list_unresolved_wiki_links.\n\
             Summarize the most connected notes and list broken [[labels]] with source document titles.\n\
             Suggest which missing notes are worth creating with create_note.",
        )])
        .with_description("Wiki hubs and unresolved links")
    }

    #[prompt(description = "Rewrite selected text with Local AI without changing the note.")]
    fn rewrite_selection_draft(&self) -> GetPromptResult {
        GetPromptResult::new(vec![PromptMessage::new_text(
            Role::User,
            "Rewrite the selected Scribe text I provide.\n\
             1. Call rewrite_selection with the text and a mode (rephrase_professional, summarize_bullets, translate_sk, translate_en, or custom_prompt + customInstruction).\n\
             2. Show the rewritten output. Do not call replace_document_content unless I explicitly ask to apply it.",
        )])
        .with_description("Rewrite selection (preview only)")
    }

    #[prompt(description = "Continue a persisted document chat using saved turns.")]
    fn continue_document_chat(&self) -> GetPromptResult {
        GetPromptResult::new(vec![PromptMessage::new_text(
            Role::User,
            "Continue the Scribe document chat for the note I name or give by id.\n\
             Prefer document_answer_and_save (loads history, answers, stores both turns).\n\
             If write is disabled, list_document_chat then document_answer with recent turns as context.\n\
             Do not invent prior messages that were not returned.",
        )])
        .with_description("Resume saved document chat")
    }

    #[prompt(description = "Analyze a note: full analysis, then keywords, then organize.")]
    fn analyze_this_note(
        &self,
        Parameters(params): Parameters<tools::AnalyzeThisNoteParams>,
    ) -> GetPromptResult {
        GetPromptResult::new(vec![PromptMessage::new_text(
            Role::User,
            format!(
                "Analyze Scribe note {id}.\n\
                 1. Call document_analysis with id={id}.\n\
                 2. Call extract_keywords with the same id.\n\
                 3. Call suggest_organize with the same id.\n\
                 Summarize language, tone, keywords, outline, and the best folder. Do not move the note unless I ask.",
                id = params.id
            ),
        )])
        .with_description("Analyze → keywords → organize")
    }

    #[prompt(description = "List libraries, switch if needed, then search.")]
    fn switch_and_search(
        &self,
        Parameters(params): Parameters<tools::SwitchAndSearchParams>,
    ) -> GetPromptResult {
        let library = params
            .library
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "the library I name".to_string());
        let query = params
            .query
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "the query I give".to_string());
        GetPromptResult::new(vec![PromptMessage::new_text(
            Role::User,
            format!(
                "Search Scribe across libraries.\n\
                 1. Call list_libraries.\n\
                 2. If {library} is not active, call switch_library with that library id.\n\
                 3. Call search with query={query}.\n\
                 Quote titles and ids. Do not invent hits."
            ),
        )])
        .with_description("Switch library then search")
    }
}

#[tool_handler]
#[prompt_handler]
impl ServerHandler for ScribeMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_prompts()
                .enable_resources()
                .build(),
        )
        .with_instructions(
            "Scribe local notes. Prefer search (with folderId/tag/fromDate/toDate), \
             get_document_outline, then get_document or export_document. \
             list_documents / create_note / search are scoped to the active library — \
             call list_libraries / switch_library first if the user names another library. \
             create_library adds a library without switching. \
             extract_entities / extract_mentions / extract_dates / extract_outline / chunk_text accept id or text. \
             For Q&A over the library use library_answer. \
             For one-note Q&A use document_answer_and_save (or document_answer + list/append_document_chat). \
             For note insights use document_analysis / extract_keywords / analyze_sentiment. \
             For unsaved text use rewrite_selection / analyze_plaintext. \
             Cached AI: list_nlp_artifacts then get_nlp_artifact or scribe://artifact/{id}. \
             Memory: library_answer stores library_memory artifacts; document_answer_and_save stores document_memory. \
             Manuscripts: list_manuscripts / upsert_manuscript / compile_manuscript. \
             Smart folders: list_smart_folders / evaluate_smart_folder. \
             Sync: list_sync_conflicts / resolve_sync_conflict. \
             Media: list_document_assets / extract_asset_ocr. \
             Find/replace is dry-run by default (library_find_replace). \
             Templates: list_templates then create_note_from_template. \
             Backups: list_backups / create_backup. \
             Documents are also readable as resources scribe://doc/{id}.",
        )
    }

    fn list_resources(
        &self,
        _request: Option<rmcp::model::PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<ListResourcesResult, ErrorData>> + Send {
        let resources = self.list_document_resources();
        ready(resources.map(ListResourcesResult::with_all_items))
    }

    fn list_resource_templates(
        &self,
        _request: Option<rmcp::model::PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<ListResourceTemplatesResult, ErrorData>> + Send {
        ready(Ok(ListResourceTemplatesResult::with_all_items(vec![
            ResourceTemplate::new("scribe://doc/{id}", "scribe-document")
                .with_title("Scribe document")
                .with_description("Plain-text body of a note")
                .with_mime_type("text/plain"),
            ResourceTemplate::new("scribe://artifact/{id}", "scribe-artifact")
                .with_title("NLP artifact")
                .with_description("Cached journal_summary or library_report JSON")
                .with_mime_type("application/json"),
        ])))
    }

    fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<ReadResourceResponse, ErrorData>> + Send {
        ready(self.read_scribe_resource(&request.uri).map(|contents| {
            ReadResourceResponse::from(ReadResourceResult::new(vec![contents]))
        }))
    }
}

impl ScribeMcp {
    fn list_document_resources(&self) -> Result<Vec<Resource>, ErrorData> {
        self.with_store(|store| {
            let docs = store.list_documents(None, Some(40))?;
            Ok(docs
                .into_iter()
                .map(|doc| {
                    Resource::new(format!("scribe://doc/{}", doc.id), doc.title.clone())
                        .with_title(doc.title)
                        .with_mime_type("text/plain")
                        .with_description("Scribe note")
                })
                .collect())
        })
        .map_err(|error| ErrorData::internal_error(error, None))
    }

    fn read_scribe_resource(&self, uri: &str) -> Result<ResourceContents, ErrorData> {
        let uri = uri.trim();
        if let Some(id) = uri.strip_prefix("scribe://doc/") {
            let doc = self
                .with_store(|store| {
                    store
                        .get_document_scoped(id, false, self.vault_scope)?
                        .ok_or_else(|| format!("Document not found: {id}"))
                })
                .map_err(|error| ErrorData::resource_not_found(error, None))?;
            return Ok(ResourceContents::text(doc.plain_text, uri).with_mime_type("text/plain"));
        }
        if let Some(id) = uri.strip_prefix("scribe://artifact/") {
            let artifact = self
                .with_store(|store| {
                    store
                        .get_nlp_artifact(id)?
                        .ok_or_else(|| format!("Artifact not found: {id}"))
                })
                .map_err(|error| ErrorData::resource_not_found(error, None))?;
            let text = serde_json::to_string_pretty(&artifact.payload).unwrap_or_default();
            return Ok(ResourceContents::text(text, uri).with_mime_type("application/json"));
        }
        Err(ErrorData::resource_not_found(
            format!("Unknown resource URI: {uri}. Use scribe://doc/{{id}} or scribe://artifact/{{id}}."),
            None,
        ))
    }
}
