use crate::tools;
use std::path::PathBuf;
use std::sync::Mutex;

use rmcp::{tool, tool_router};
use scribe_core::nlp::{resolve_script_path, NlpSidecar};
use scribe_core::store::{open_scribe_store, JournalSummaryInput, ScribeStore};

pub struct ScribeMcp {
    store: Mutex<ScribeStore>,
    sidecar: NlpSidecar,
    pub db_path: PathBuf,
    pub writable: bool,
}

impl ScribeMcp {
    pub fn new() -> anyhow::Result<Self> {
        let opened = open_scribe_store(None).map_err(|error| anyhow::anyhow!(error))?;
        Ok(Self {
            store: Mutex::new(opened.store),
            sidecar: NlpSidecar::new(resolve_script_path()),
            db_path: opened.db_path,
            writable: opened.writable,
        })
    }

    fn with_store<T, F: FnOnce(&ScribeStore) -> Result<T, String>>(&self, f: F) -> Result<T, String> {
        let guard = self.store.lock().map_err(|e| e.to_string())?;
        f(&guard)
    }
}

#[tool_router(server_handler)]
impl ScribeMcp {
    #[tool(description = "Health check: database path, writable flag, sample counts.")]
    fn scribe_status(&self) -> Result<String, String> {
        self.with_store(|store| {
            let docs = store.list_documents(None, Some(1))?;
            let graph = store.list_link_graph()?;
            Ok(tools::json(&serde_json::json!({
                "ok": true,
                "dbPath": self.db_path,
                "writable": self.writable,
                "sampleDocumentCount": docs.len(),
                "edgeCount": graph.edges.len(),
                "orphanCount": graph.orphans.len(),
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
            let hits = store.search_documents(&self.sidecar, &params.query, params.limit.unwrap_or(10))?;
            Ok(tools::json(&serde_json::json!({
                "query": params.query,
                "count": hits.len(),
                "hits": hits,
                "mode": "hybrid"
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
            Ok(tools::json(&serde_json::json!({
                "query": params.query,
                "count": hits.len(),
                "hits": hits,
                "mode": "fts"
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
            Ok(tools::json(&serde_json::json!({
                "query": params.query,
                "count": hits.len(),
                "hits": hits,
                "mode": "semantic"
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
            Ok(tools::json(&serde_json::json!({
                "documentId": params.id,
                "count": hits.len(),
                "hits": hits,
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
                .get_document(&params.id, params.include_json.unwrap_or(false))?
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

    #[tool(description = "Unified search with mode: hybrid (default), semantic, or fts.")]
    fn search(
        &self,
        rmcp::handler::server::wrapper::Parameters(params): rmcp::handler::server::wrapper::Parameters<
            tools::SearchModeParams,
        >,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let hits = store.search_with_mode(
                &self.sidecar,
                &params.query,
                params.limit.unwrap_or(10),
                params.mode.as_deref(),
            )?;
            Ok(tools::json(&serde_json::json!({
                "query": params.query,
                "mode": params.mode.unwrap_or_else(|| "hybrid".to_string()),
                "count": hits.len(),
                "hits": hits,
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
}
