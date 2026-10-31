//! Scribe MCP server: struct, helpers, merged tool/prompt routers, resources.

mod agent_exec;
mod prompts;
mod resources;
mod tools_agent;
mod tools_audit;
mod tools_documents;
mod tools_journal;
mod tools_library;
mod tools_study_files;
mod tools_ui;
mod tools_wiki;

use std::future::ready;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use rmcp::handler::server::router::prompt::PromptRouter;
use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::model::{
    ErrorData, ListResourceTemplatesResult, ListResourcesResult, ReadResourceRequestParams,
    ReadResourceResponse, ReadResourceResult, ResourceTemplate, ServerCapabilities, ServerConfig,
};
use rmcp::service::RequestContext;
use rmcp::{prompt_handler, tool_handler, RoleServer, ServerHandler};
use scribe_core::nlp::{resolve_script_path, NlpSidecar};
use scribe_core::store::{open_scribe_store, ScribeStore};
use scribe_core::vault::McpVaultScope;

/// Shared across stdio (single instance) and Streamable HTTP (cloned per request).
#[derive(Clone)]
pub struct ScribeMcp {
    store: Arc<Mutex<ScribeStore>>,
    sidecar: Arc<NlpSidecar>,
    pub db_path: PathBuf,
    pub writable: bool,
    pub vault_scope: McpVaultScope,
}

impl ScribeMcp {
    pub fn new() -> anyhow::Result<Self> {
        let opened = open_scribe_store(None).map_err(|error| anyhow::anyhow!(error))?;
        let vault_scope = McpVaultScope::from_env();
        eprintln!(
            "[scribe-mcp] vault scope={} (SCRIBE_MCP_SCOPE) writable={} (SCRIBE_MCP_WRITE=1 to enable writes)",
            vault_scope.as_str(),
            opened.writable
        );
        if opened.writable {
            eprintln!(
                "[scribe-mcp] WARNING: write tools enabled (SCRIBE_MCP_WRITE=1). Prefer read-only."
            );
        }
        if vault_scope != McpVaultScope::NoVault {
            eprintln!(
                "[scribe-mcp] WARNING: SCRIBE_MCP_SCOPE={} exposes vault metadata/ciphertext to MCP tools. Prefer no-vault.",
                vault_scope.as_str()
            );
        }
        Ok(Self {
            store: Arc::new(Mutex::new(opened.store)),
            sidecar: Arc::new(NlpSidecar::new(resolve_script_path())),
            db_path: opened.db_path,
            writable: opened.writable,
            vault_scope,
        })
    }

    pub(crate) fn with_store<T, F: FnOnce(&ScribeStore) -> Result<T, String>>(
        &self,
        f: F,
    ) -> Result<T, String> {
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

    fn open_agent_store(&self) -> Option<scribe_agent::AgentStore> {
        let parent = self.db_path.parent()?;
        scribe_agent::AgentStore::from_path(&parent.join(scribe_agent::AGENT_DB_FILE)).ok()
    }

    fn open_audit_store(&self) -> Option<scribe_audit::AuditStore> {
        let parent = self.db_path.parent()?;
        scribe_audit::AuditStore::from_path(&parent.join(scribe_audit::AUDIT_DB_FILE)).ok()
    }

    pub(crate) fn audit_mcp(
        &self,
        category: &str,
        action: &str,
        summary: &str,
        detail: Option<serde_json::Value>,
        outcome: &str,
    ) {
        let Some(store) = self.open_audit_store() else {
            return;
        };
        let _ = store.append(scribe_audit::AuditEventInput {
            source: "mcp".into(),
            category: category.into(),
            action: action.into(),
            actor: Some("mcp".into()),
            summary: summary.into(),
            detail,
            outcome: Some(outcome.into()),
            ..Default::default()
        });
    }

    fn agent_teachings_preamble(&self, grammar_only: bool) -> Option<String> {
        let store = self.open_agent_store()?;
        let agent_id = if grammar_only { "proofreader" } else { "general" };
        let teachings = store.list_teachings(Some(agent_id)).ok()?;
        scribe_agent::memory_preamble(&teachings, grammar_only)
    }

    fn grammar_rules_from_agent(&self) -> Vec<String> {
        self.open_agent_store()
            .and_then(|store| store.list_teachings(Some("proofreader")).ok())
            .map(|teachings| scribe_agent::grammar_rule_texts(&teachings))
            .unwrap_or_default()
    }
}


impl ScribeMcp {
    /// Combined tool router for `#[tool_handler]`.
    pub fn tool_router() -> ToolRouter<Self> {
        Self::router_documents()
            + Self::router_journal()
            + Self::router_agent()
            + Self::router_library()
            + Self::router_study_files()
            + Self::router_wiki()
            + Self::router_ui()
            + Self::router_audit()
    }

    /// Combined prompt router for `#[prompt_handler]`.
    pub fn prompt_router() -> PromptRouter<Self> {
        Self::prompt_router_main()
    }
}

#[tool_handler]
#[prompt_handler]
impl ServerHandler for ScribeMcp {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_prompts()
                .enable_resources()
                .build(),
        )
        .with_instructions(
            "Scribe local notes.              Prefer search (with folderId/tag/fromDate/toDate), \
             get_document_outline, then get_document or export_document. \
             For multi-step local agent goals use run_agent (same planner as the Scribe app; persona=spellcheck|librarian|meeting|study|organizer|developer; documentIdB/revisionId for compare/revision). \
             Prefer run_spellcheck_agent when the user only wants spelling/grammar on one note. \
             list_documents / create_note / search are scoped to the active library — \
             call list_libraries / switch_library first if the user names another library. \
             create_library adds a library without switching. \
             extract_entities / extract_mentions / extract_dates / extract_outline / chunk_text accept id or text. \
             Study AI: extract_flashcards / extract_takeaways / check_terminology / writing_coach / outline_quiz / meeting_notes_pack / explain_selection / simplify / action_items / glossary / compare_notes (id or text). \
             Review pack: section_summaries / extract_decisions / extract_quotes / extract_commitments / detect_pii / rank_tasks / open_loops / reading_plan / note_pulse / tone_pack / contradiction_hints / forward_plan. \
             Retrieval helpers: passage_rerank / answer_followups (after library_answer or document_answer). \
             Planner-only: plan_agent_goal / agent_document_brief (run_agent still executes). \
             UI catalogs: get_ui_manifest / fuzzy_rank_strings / list_theme_presets / generate_random_theme / render_ui_surface (HTML via python-ui). \
             Files sandbox AI: files_list / files_read_text / files_search / files_summarize / files_answer / files_index / files_index_status / files_similar / files_index_clear (requires Local Files API). \
             Library study: check_terminology_library / citation_pack. \
             Intent router: match_document_chat_intent. Convert: convert_tiptap. Diff: diff_plain_texts. Meta tags: document_matches_meta_filters. \
             Placeholder: generate_placeholder. Answer backend: set_answer_backend. \
             Revision AI: analyze_revision_diff or analyze_revision_diff_for_document; delete_document_revision cleans history. \
             Continue writing: suggest_continuation from the local library corpus. \
             Wiki: wiki_health_report / list_stub_documents / list_orphan_documents / list_unresolved_wiki_links / \
             suggest_wiki_resolutions / resolve_wiki_link / create_and_link_wiki_note / auto_resolve_wiki_links / \
             expand_stub_document / list_graph_hubs / wiki_neighborhood / find_wiki_ghost_match / \
             parse_document_aliases / add_document_alias. \
             Tasks: list_open_tasks / list_tasks_agenda (overdue|today|upcoming|later). \
             Source: export_document_source (first codeBlock + extension). \
             Smart filters: filter_library_smart (unlinked|untagged|unread|stubs|tasks|media|…). \
             Videos: list_library_videos / get_library_video / delete_library_video. \
             Templates: list_templates / create_note_from_template / parse_template_pack. \
             Audit: audit_status / list_audit_events / get_audit_event / get_audit_stats / export_audit_events_jsonl. \
             Smart folders: list_smart_folders / upsert_smart_folder / delete_smart_folder / evaluate_smart_folder. \
             Resources: scribe://doc/{id}, scribe://artifact/{id}, scribe://revision/{docId}/{revId}. \
             For Q&A over the library use library_answer. \
             For one-note Q&A use document_answer_and_save (or document_answer + list/append_document_chat). \
             For note insights use document_analysis / extract_keywords / analyze_sentiment. \
             For unsaved text use rewrite_selection / analyze_plaintext / generate_placeholder. \
             Cached AI: list_nlp_artifacts then get_nlp_artifact or scribe://artifact/{id}. \
             Memory: library_answer stores library_memory artifacts; document_answer_and_save stores document_memory. \
             Manuscripts: list_manuscripts / upsert_manuscript / compile_manuscript. \
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
            ResourceTemplate::new(
                "scribe://revision/{documentId}/{revisionId}",
                "scribe-revision",
            )
                .with_title("Document revision")
                .with_description("Plain-text snapshot of a saved revision")
                .with_mime_type("text/plain"),
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

pub(crate) fn search_filter(
    folder_id: Option<String>,
    tag: Option<String>,
    from_date: Option<String>,
    to_date: Option<String>,
    library_id: Option<String>,
) -> scribe_core::store::SearchFilter {
    scribe_core::store::SearchFilter {
        folder_id,
        tag,
        from_date,
        to_date,
        library_id,
    }
}
