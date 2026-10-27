use crate::server::ScribeMcp;
use crate::tools;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::{tool, tool_router};


#[tool_router(router = router_wiki, vis = "pub(crate)")]
impl ScribeMcp {
    #[tool(description = "Revision AI: classify what changed between two plain texts (changeKind, risks, bullets). Python preferred; Rust fallback always available.")]
    fn analyze_revision_diff(
        &self,
        Parameters(params): Parameters<tools::AnalyzeRevisionDiffParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.analyze_revision_diff(
                &self.sidecar,
                &params.old_text,
                &params.new_text,
                params.max_bullets,
                params.language.as_deref(),
                params.prefer_rust,
            )?))
        })
    }

    #[tool(description = "Revision AI for a saved snapshot vs the current note body. Prefer this over summarize_revision_diff when you need changeKind/risks.")]
    fn analyze_revision_diff_for_document(
        &self,
        Parameters(params): Parameters<tools::AnalyzeRevisionDiffDocParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.analyze_revision_diff_for_document(
                &self.sidecar,
                &params.id,
                &params.revision_id,
                params.max_bullets,
                params.language.as_deref(),
                params.prefer_rust,
            )?))
        })
    }

    #[tool(description = "Suggest continue-writing phrases from the local library corpus (n-grams). Optional excludeDocumentId for the note being edited. Rust fallback if Local AI is off.")]
    fn suggest_continuation(
        &self,
        Parameters(params): Parameters<tools::SuggestContinuationParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.suggest_continuation(
                &self.sidecar,
                &params.prefix,
                params.max_suggestions,
                params.max_tokens,
                params.exclude_document_id.as_deref(),
                params.prefer_rust,
            )?))
        })
    }

    #[tool(description = "Wiki health report: unresolved [[links]], stub notes, and graph summary.")]
    fn wiki_health_report(
        &self,
        Parameters(params): Parameters<tools::WikiHealthParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.wiki_health(
                params.unresolved_limit.unwrap_or(40).clamp(1, 200),
                params.stub_max_words.unwrap_or(40).clamp(5, 200),
                params.stub_limit.unwrap_or(20).clamp(1, 100),
            )?))
        })
    }

    #[tool(description = "List stub short notes (few words) that may need expanding.")]
    fn list_stub_documents(
        &self,
        Parameters(params): Parameters<tools::StubDocumentsParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let stubs = store.list_stub_documents(
                params.max_words.unwrap_or(40).clamp(5, 200),
                params.limit.unwrap_or(20).clamp(1, 100),
            )?;
            Ok(tools::json(&serde_json::json!({
                "count": stubs.len(),
                "stubs": stubs,
            })))
        })
    }

    #[tool(description = "Notes with no incoming or outgoing [[wiki links]] (graph orphans).")]
    fn list_orphan_documents(&self) -> Result<String, String> {
        self.with_store(|store| {
            let orphans = store.list_orphan_documents()?;
            Ok(tools::json(&serde_json::json!({
                "count": orphans.len(),
                "orphans": orphans,
            })))
        })
    }

    #[tool(
        description = "Resolve an unresolved [[label]] in a note by setting targetId. Requires writable DB (SCRIBE_MCP_WRITE=1)."
    )]
    fn resolve_wiki_link(
        &self,
        Parameters(params): Parameters<tools::ResolveWikiLinkParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        let result = self.with_store(|store| {
            Ok(tools::json(&store.resolve_wiki_link(
                &params.document_id,
                &params.label,
                &params.target_id,
            )?))
        })?;
        self.audit_mcp(
            "mcp_tool",
            "resolve_wiki_link",
            &format!(
                "MCP resolve_wiki_link: [[{}]] → {}",
                params.label.trim(),
                params.target_id.trim()
            ),
            Some(serde_json::json!({
                "documentId": params.document_id,
                "label": params.label,
                "targetId": params.target_id,
            })),
            "ok",
        );
        Ok(result)
    }

    #[tool(
        description = "Create a note titled like an unresolved [[label]] and link the source note to it. Requires writable DB."
    )]
    fn create_and_link_wiki_note(
        &self,
        Parameters(params): Parameters<tools::CreateAndLinkWikiParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        let label = params.label.trim().to_string();
        if label.is_empty() {
            return Err("label is required".to_string());
        }
        let result = self.with_store(|store| {
            let created = store.create_note(
                &label,
                params.content.as_deref(),
                params.folder_id.as_deref(),
            )?;
            let linked = store.resolve_wiki_link(&params.document_id, &label, &created.id)?;
            Ok(tools::json(&serde_json::json!({
                "created": created,
                "linked": linked,
            })))
        })?;
        self.audit_mcp(
            "mcp_tool",
            "create_and_link_wiki_note",
            &format!("MCP create_and_link_wiki_note: [[{label}]]"),
            Some(serde_json::json!({
                "documentId": params.document_id,
                "label": label,
            })),
            "ok",
        );
        Ok(result)
    }

    #[tool(
        description = "List unresolved [[wiki links]] with fuzzy title suggestions (scores). Use before resolve_wiki_link or auto_resolve_wiki_links."
    )]
    fn suggest_wiki_resolutions(
        &self,
        Parameters(params): Parameters<tools::LimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            let links = store.list_unresolved_wiki_links_with_suggestions(
                params.limit.unwrap_or(40).clamp(1, 200),
            )?;
            Ok(tools::json(&serde_json::json!({
                "count": links.len(),
                "links": links,
            })))
        })
    }

    #[tool(
        description = "Auto-resolve unresolved [[links]] when the best title suggestion score >= minScore (default 0.72). Requires writable DB."
    )]
    fn auto_resolve_wiki_links(
        &self,
        Parameters(params): Parameters<tools::AutoResolveWikiParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        let result = self.with_store(|store| {
            Ok(tools::json(&store.auto_resolve_wiki_links(
                params.limit.unwrap_or(40).clamp(1, 200),
                params.min_score.unwrap_or(0.72),
            )?))
        })?;
        self.audit_mcp(
            "mcp_tool",
            "auto_resolve_wiki_links",
            "MCP auto_resolve_wiki_links",
            Some(serde_json::json!({
                "limit": params.limit,
                "minScore": params.min_score,
            })),
            "ok",
        );
        Ok(result)
    }

    #[tool(
        description = "Filter library notes with smart filters: none|unlinked|untagged|unread|canvas|stubs|tasks|media (parity with Scribe sidebar chips)."
    )]
    fn filter_library_smart(
        &self,
        Parameters(params): Parameters<tools::SmartFilterParams>,
    ) -> Result<String, String> {
        let filter = scribe_ui::LibrarySmartFilter::parse_id(params.filter.trim())
            .ok_or_else(|| {
                format!(
                    "Unknown filter '{}'. Use: {}",
                    params.filter.trim(),
                    scribe_ui::smart_filter_ids().join(", ")
                )
            })?;
        self.with_store(|store| {
            let limit = params.limit.unwrap_or(80).clamp(1, 200);
            let docs = store.list_documents(params.folder_id.as_deref(), Some(limit.max(80)))?;
            let graph = store.list_link_graph().ok();
            let stubs = store.list_stub_documents(40, 200).unwrap_or_default();
            let tasks = store
                .list_open_tasks(&self.sidecar, params.folder_id.as_deref(), 400, false)
                .unwrap_or_default();
            let videos = store.list_library_videos().unwrap_or_default();
            let options = scribe_ui::SmartFilterOptions {
                orphan_ids: graph
                    .as_ref()
                    .map(|g| g.orphans.iter().map(|o| o.id.clone()).collect())
                    .unwrap_or_default(),
                recent_document_ids: Vec::new(),
                canvas_ids: Vec::new(),
                stub_ids: stubs.iter().map(|s| s.id.clone()).collect(),
                task_doc_ids: tasks
                    .iter()
                    .filter_map(|t| t.document_id.clone())
                    .collect::<std::collections::BTreeSet<_>>()
                    .into_iter()
                    .collect(),
                media_doc_ids: videos
                    .iter()
                    .filter_map(|v| v.document_id.clone())
                    .collect::<std::collections::BTreeSet<_>>()
                    .into_iter()
                    .collect(),
            };
            let filter_docs: Vec<scribe_ui::SmartFilterDoc> = docs
                .iter()
                .map(|d| scribe_ui::SmartFilterDoc {
                    id: d.id.clone(),
                    tags: d.tags.clone(),
                    deleted_at: d.deleted_at,
                })
                .collect();
            let matched =
                scribe_ui::filter_documents_by_smart_filter(&filter_docs, filter, &options);
            let matched_ids: std::collections::HashSet<_> =
                matched.iter().map(|d| d.id.as_str()).collect();
            let summaries: Vec<_> = docs
                .into_iter()
                .filter(|d| matched_ids.contains(d.id.as_str()))
                .take(limit as usize)
                .collect();
            Ok(tools::json(&serde_json::json!({
                "filter": filter.as_id(),
                "count": summaries.len(),
                "documents": summaries,
            })))
        })
    }

    #[tool(description = "List local library videos (large video library: id, title, duration, transcriptDocumentId, documentId).")]
    fn list_library_videos(&self) -> Result<String, String> {
        self.with_store(|store| {
            let videos = store.list_library_videos()?;
            Ok(tools::json(&serde_json::json!({
                "count": videos.len(),
                "videos": videos,
            })))
        })
    }

    #[tool(
        description = "Get one library video by id (source path, status, duration, transcript paths)."
    )]
    fn get_library_video(
        &self,
        Parameters(params): Parameters<tools::LibraryVideoIdParams>,
    ) -> Result<String, String> {
        let id = params.id.trim();
        if id.is_empty() {
            return Err("id is required".into());
        }
        self.with_store(|store| {
            let video = store
                .get_library_video(id)?
                .ok_or_else(|| format!("Library video not found: {id}"))?;
            Ok(tools::json(&video))
        })
    }

    #[tool(
        description = "Delete a library video row (and copied sandbox files when present). Requires writable DB. Does not delete linked transcript documents."
    )]
    fn delete_library_video(
        &self,
        Parameters(params): Parameters<tools::LibraryVideoIdParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        let id = params.id.trim();
        if id.is_empty() {
            return Err("id is required".into());
        }
        let result = self.with_store(|store| {
            let Some(video) = store.get_library_video(id)? else {
                return Err(format!("Library video not found: {id}"));
            };
            let deleted = store.delete_library_video(id)?;
            Ok(tools::json(&serde_json::json!({
                "deleted": deleted,
                "id": id,
                "title": video.title,
            })))
        })?;
        self.audit_mcp(
            "mcp_tool",
            "delete_library_video",
            &format!("MCP delete_library_video {id}"),
            Some(serde_json::json!({ "id": id })),
            "ok",
        );
        Ok(result)
    }

    #[tool(
        description = "Append a short outline scaffold to a stub note (heading + seed paragraph + 3 bullets). Requires writable DB."
    )]
    fn expand_stub_document(
        &self,
        Parameters(params): Parameters<tools::ExpandStubParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        let heading = params
            .heading
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Outline");
        let result = self.with_store(|store| {
            let doc = store
                .get_document(&params.id, false)?
                .ok_or_else(|| format!("Document not found: {}", params.id))?;
            let title = doc.title.clone();
            let seed = format!("Expand „{title}“ — replace this outline with real content.");
            let body = format!(
                "{heading}\n\n{seed}\n\n- Point 1\n- Point 2\n- Point 3"
            );
            Ok(tools::json(&store.append_to_note(&params.id, &body)?))
        })?;
        self.audit_mcp(
            "mcp_tool",
            "expand_stub_document",
            &format!("MCP expand_stub_document: {}", params.id),
            Some(serde_json::json!({ "id": params.id })),
            "ok",
        );
        Ok(result)
    }
}
