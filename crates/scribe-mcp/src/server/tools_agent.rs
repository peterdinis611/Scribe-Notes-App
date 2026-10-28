use crate::server::{search_filter, ScribeMcp};
use crate::tools;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::{tool, tool_router};


#[tool_router(router = router_agent, vis = "pub(crate)")]
impl ScribeMcp {
    #[tool(description = "Answer a question from the local library (hybrid search + Local AI). Optional folderId scopes to one folder. Requires Local AI.")]
    fn library_answer(
        &self,
        Parameters(params): Parameters<tools::LibraryAnswerParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            if let Some(folder_id) = params
                .folder_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                let limit = params.limit.unwrap_or(8).clamp(1, 20);
                let filter = search_filter(
                    Some(folder_id.to_string()),
                    None,
                    None,
                    None,
                    None,
                );
                let hits = store.search_with_mode(
                    &self.sidecar,
                    &params.question,
                    limit,
                    Some("hybrid"),
                    Some(&filter),
                )?;
                let hits = self.filter_hits(store, hits)?;
                let passages: Vec<serde_json::Value> = hits
                    .iter()
                    .map(|hit| {
                        serde_json::json!({
                            "documentId": hit.document_id,
                            "title": hit.title,
                            "snippet": hit.snippet,
                            "chunkIndex": hit.chunk_index,
                        })
                    })
                    .collect();
                let result = self.sidecar.library_answer_scoped_with_options(
                    params.question.trim(),
                    serde_json::json!(passages),
                    4,
                    "library",
                    None,
                    store.llm_options("answer")?,
                )?;
                return Ok(tools::json(&serde_json::json!({
                    "folderId": folder_id,
                    "hitCount": hits.len(),
                    "result": result,
                })));
            }
            Ok(tools::json(&store.library_answer(
                &self.sidecar,
                &params.question,
                params.limit,
            )?))
        })
    }

    #[tool(
        description = "Run the same local agent planner used in the Scribe app: plan_agent_goal then execute tools. persona=general|spellcheck|proofreader|librarian|meeting|study|organizer|developer. For compare_notes/contradictions pass documentIdB; for revision pass revisionId. Requires Local AI."
    )]
    fn run_agent(
        &self,
        Parameters(params): Parameters<tools::RunAgentParams>,
    ) -> Result<String, String> {
        let goal = params.goal.trim();
        if goal.is_empty() {
            return Err("goal is required".to_string());
        }
        let persona = normalize_run_agent_persona(params.persona.as_deref());
        let scope = params
            .scope
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(if params.document_id.as_deref().map(str::trim).filter(|v| !v.is_empty()).is_some() {
                "document"
            } else {
                "library"
            });
        let document_id = params
            .document_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string());
        let document_id_b = params
            .document_id_b
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string());
        let revision_id = params
            .revision_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string());

        self.run_agent_with_persona(
            goal,
            scope,
            document_id,
            document_id_b,
            revision_id,
            params.max_tools,
            &persona,
        )
    }

    #[tool(
        description = "Spellcheck Agent: check spelling on one note using the same path as the in-app Spellcheck Agent. Applies grammar teachings from Scribe settings. Requires documentId + Local AI."
    )]
    fn run_spellcheck_agent(
        &self,
        Parameters(params): Parameters<tools::RunSpellcheckAgentParams>,
    ) -> Result<String, String> {
        let document_id = params.document_id.trim();
        if document_id.is_empty() {
            return Err("documentId is required".into());
        }
        let goal = params
            .goal
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("Check spelling in this note");

        self.run_agent_with_persona(
            goal,
            "document",
            Some(document_id.to_string()),
            None,
            None,
            Some(1),
            "spellcheck",
        )
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
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        let result = self.with_store(|store| {
            Ok(tools::json(
                &store.set_nlp_enabled_flag(&self.sidecar, params.enabled)?,
            ))
        })?;
        self.audit_mcp(
            "nlp",
            "set_enabled",
            &format!("MCP set_nlp_enabled: {}", params.enabled),
            Some(serde_json::json!({ "enabled": params.enabled })),
            "ok",
        );
        Ok(result)
    }

    #[tool(description = "Set embedding backend: hash (default), fast (model2vec), or quality (MiniLM). Requires writable DB; reindex after switching.")]
    fn set_embed_backend(
        &self,
        Parameters(params): Parameters<tools::SetEmbedBackendParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        self.with_store(|store| {
            Ok(tools::json(
                &store.set_nlp_embed_backend(&self.sidecar, &params.backend)?,
            ))
        })
    }

    #[tool(description = "Set answer embedding backend: auto (default), index, or quality. Requires writable DB.")]
    fn set_answer_backend(
        &self,
        Parameters(params): Parameters<tools::SetAnswerBackendParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        self.with_store(|store| {
            Ok(tools::json(
                &store.set_nlp_answer_backend(&self.sidecar, &params.backend)?,
            ))
        })
    }

    #[tool(
        description = "Configure opt-in local LLM (Ollama): enabled, baseUrl (localhost only), model, useRewrite/useAnswer/usePlan. Requires writable DB."
    )]
    fn set_llm_prefs(
        &self,
        Parameters(params): Parameters<tools::SetLlmPrefsParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        self.with_store(|store| {
            Ok(tools::json(&store.set_nlp_llm_prefs(
                &self.sidecar,
                params.enabled,
                params.provider.as_deref(),
                params.base_url.as_deref(),
                params.model.as_deref(),
                params.use_rewrite,
                params.use_answer,
                params.use_plan,
                params.enhance_heuristics,
            )?))
        })
    }
}

/// Map MCP persona aliases onto in-app role ids (`spellcheck` → proofreader path).
pub(crate) fn normalize_run_agent_persona(raw: Option<&str>) -> String {
    let folded = raw
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_else(|| "general".into());
    match folded.as_str() {
        "spellcheck" | "spell" | "grammar" | "proofreader" => "spellcheck".into(),
        id if scribe_ui::is_agent_role_id(id) => id.to_string(),
        _ => "general".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_run_agent_persona;

    #[test]
    fn persona_defaults_to_general() {
        assert_eq!(normalize_run_agent_persona(None), "general");
        assert_eq!(normalize_run_agent_persona(Some("")), "general");
        assert_eq!(normalize_run_agent_persona(Some("  ")), "general");
        assert_eq!(normalize_run_agent_persona(Some("unknown-role")), "general");
    }

    #[test]
    fn persona_spellcheck_aliases() {
        for raw in ["spellcheck", "spell", "grammar", "proofreader", " SPELL "] {
            assert_eq!(normalize_run_agent_persona(Some(raw)), "spellcheck");
        }
    }

    #[test]
    fn persona_accepts_all_role_ids() {
        for id in scribe_ui::AGENT_ROLE_IDS {
            if *id == "proofreader" {
                assert_eq!(normalize_run_agent_persona(Some(id)), "spellcheck");
            } else {
                assert_eq!(normalize_run_agent_persona(Some(id)), *id);
            }
        }
    }
}
