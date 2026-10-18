use crate::server::ScribeMcp;
use crate::tools;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::{tool, tool_router};


#[tool_router(router = router_ui, vis = "pub(crate)")]
impl ScribeMcp {
    #[tool(description = "Permanently delete a document revision snapshot. Requires writable DB.")]
    fn delete_document_revision(
        &self,
        Parameters(params): Parameters<tools::DeleteIdParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        self.with_store(|store| Ok(tools::json(&store.delete_document_revision(&params.id)?)))
    }

    #[tool(description = "Build quiz questions from outline headings (id or plaintext). Requires Local AI.")]
    fn outline_quiz(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.outline_quiz(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Meeting notes pack: decisions, action items, and attendees from a note id or plaintext. Requires Local AI.")]
    fn meeting_notes_pack(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.meeting_notes_pack(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Cross-note terminology consistency across the active library. Requires Local AI.")]
    fn check_terminology_library(
        &self,
        Parameters(params): Parameters<tools::TerminologyLibraryParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.check_terminology_library(
                &self.sidecar,
                params.limit,
                params.document_limit,
            )?))
        })
    }

    #[tool(description = "Citation pack: which notes support a claim (hybrid search + supporting bullets). Requires Local AI.")]
    fn citation_pack(
        &self,
        Parameters(params): Parameters<tools::CitationPackParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.citation_pack(
                &self.sidecar,
                &params.claim,
                params.limit,
            )?))
        })
    }

    #[tool(description = "Map a free-form question to a structured document chat action (summarize, flashcards, style, …). EN/SK.")]
    fn match_document_chat_intent(
        &self,
        Parameters(params): Parameters<tools::QuestionParams>,
    ) -> Result<String, String> {
        let action = scribe_core::match_document_chat_intent(&params.question);
        Ok(tools::json(&serde_json::json!({
            "action": action,
            "matched": action.is_some(),
        })))
    }

    #[tool(description = "Convert TipTap JSON to plain text or markdown (canonical Rust serializers).")]
    fn convert_tiptap(
        &self,
        Parameters(params): Parameters<tools::ConvertTiptapParams>,
    ) -> Result<String, String> {
        let format = params.format.to_lowercase();
        let body = match format.as_str() {
            "plain" | "text" | "txt" => scribe_core::tiptap_to_plain_text(&params.content_json),
            "markdown" | "md" => scribe_core::tiptap_to_markdown(&params.content_json),
            other => return Err(format!("Unsupported format: {other}")),
        };
        Ok(tools::json(&serde_json::json!({
            "format": format,
            "text": body,
        })))
    }

    #[tool(description = "Line + word-level side-by-side diff of two plain-text blobs.")]
    fn diff_plain_texts(
        &self,
        Parameters(params): Parameters<tools::DiffPlainTextsParams>,
    ) -> Result<String, String> {
        Ok(tools::json(&scribe_core::diff_lines(
            &params.old_text,
            &params.new_text,
        )))
    }

    #[tool(description = "Whether document tags match status:/project:/year: meta filters.")]
    fn document_matches_meta_filters(
        &self,
        Parameters(params): Parameters<tools::MetaFiltersParams>,
    ) -> Result<String, String> {
        let matched = scribe_core::document_matches_meta_filters(
            &params.tags,
            &scribe_core::MetaFilters {
                status: params.status,
                project: params.project,
                year: params.year,
            },
        );
        Ok(tools::json(&serde_json::json!({ "matched": matched })))
    }

    #[tool(description = "UI domain manifest from scribe-ui (version, Whats New, settings/docs ids, themes, agent roles/recipes). No DB.")]
    fn get_ui_manifest(&self) -> Result<String, String> {
        Ok(tools::json(&scribe_ui::ui_manifest()))
    }

    #[tool(description = "Fuzzy-rank a list of {id, primary, secondary?} strings (scribe-ui Skim matcher). No DB.")]
    fn fuzzy_rank_strings(
        &self,
        Parameters(params): Parameters<tools::FuzzyRankParams>,
    ) -> Result<String, String> {
        let items: Vec<scribe_ui::FuzzyRankItem> = params
            .items
            .into_iter()
            .map(|item| scribe_ui::FuzzyRankItem {
                id: item.id,
                primary: item.primary,
                secondary: item.secondary.unwrap_or_default(),
            })
            .collect();
        let limit = params.limit.map(|n| n.clamp(1, 100) as usize);
        Ok(tools::json(&scribe_ui::fuzzy_rank_strings(
            &items,
            &params.query,
            limit,
        )))
    }

    #[tool(description = "List built-in theme preset ids + color maps (scribe-ui). No DB.")]
    fn list_theme_presets(&self) -> Result<String, String> {
        Ok(tools::json(&serde_json::json!({
            "ids": scribe_ui::theme_preset_ids(),
            "presets": scribe_ui::theme_presets(),
        })))
    }

    #[tool(description = "Generate a random light/dark theme color map (scribe-ui). No DB.")]
    fn generate_random_theme(
        &self,
        Parameters(params): Parameters<tools::RandomThemeParams>,
    ) -> Result<String, String> {
        let scheme = match params.scheme.as_deref().unwrap_or("light").to_ascii_lowercase().as_str()
        {
            "dark" => scribe_ui::ColorScheme::Dark,
            _ => scribe_ui::ColorScheme::Light,
        };
        Ok(tools::json(&scribe_ui::generate_random_theme(Some(scheme))))
    }

    #[tool(
        description = "Render Scribe chrome HTML via python-ui (whats-new, welcome, about, docs, privacy). Same CSS/data-sui-event bridge as Dioxus. Requires Local AI."
    )]
    fn render_ui_surface(
        &self,
        Parameters(params): Parameters<tools::RenderUiSurfaceParams>,
    ) -> Result<String, String> {
        let mut payload = serde_json::json!({
            "surface": params.surface,
            "version": params.version.unwrap_or_else(|| "4.1.0".into()),
        });
        if let Some(strings) = params.strings {
            payload["strings"] = serde_json::json!(strings);
        }
        if let Some(short) = params.short_version {
            payload["shortVersion"] = serde_json::json!(short);
        }
        if let Some(recent) = params.recent {
            payload["recent"] = recent;
        }
        if let Some(fragment) = params.fragment {
            payload["fragment"] = serde_json::json!(fragment);
        }
        if let Some(full) = params.full_document {
            payload["fullDocument"] = serde_json::json!(full);
        }
        let value = self
            .sidecar
            .render_ui_surface(payload)
            .map_err(|e| format!("render_ui_surface failed (is Local AI available?): {e}"))?;
        Ok(tools::json(&value))
    }

    #[tool(description = "Plan which local-agent tools to run for a goal (no execution). Same planner as run_agent. Requires Local AI.")]
    fn plan_agent_goal(
        &self,
        Parameters(params): Parameters<tools::PlanAgentGoalParams>,
    ) -> Result<String, String> {
        let scope = params.scope.unwrap_or_else(|| "document".into());
        self.with_store(|store| {
            Ok(tools::json(&store.plan_agent_goal_ctx(
                &self.sidecar,
                &params.goal,
                &scope,
                params.max_tools,
                params.role.as_deref(),
                None,
                None,
                None,
            )?))
        })
    }

    #[tool(description = "Build a short document brief for the local agent (id or plaintext + optional goal/tools). Requires Local AI.")]
    fn agent_document_brief(
        &self,
        Parameters(params): Parameters<tools::AgentDocumentBriefParams>,
    ) -> Result<String, String> {
        let tools_value = params
            .tools
            .as_ref()
            .map(|list| serde_json::json!(list));
        self.with_store(|store| {
            Ok(tools::json(&store.agent_document_brief(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.goal.as_deref(),
                tools_value.as_ref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Per-heading section summaries for a note id or plaintext. Python preferred; Rust offline fallback.")]
    fn section_summaries(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.section_summaries(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Extract decision-log bullets from a note id or plaintext. Python preferred; Rust offline fallback.")]
    fn extract_decisions(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.extract_decisions(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Scan a note id or plaintext for PII-like patterns. Python preferred; Rust offline fallback.")]
    fn detect_pii(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.detect_pii(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Extract notable quotes from a note id or plaintext. Python preferred; Rust offline fallback.")]
    fn extract_quotes(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.extract_quotes(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Extract commitments / promises from a note id or plaintext. Python preferred; Rust offline fallback.")]
    fn extract_commitments(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.extract_commitments(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Flag possible contradictions between two notes (ids or plaintexts). Requires Local AI.")]
    fn contradiction_hints(
        &self,
        Parameters(params): Parameters<tools::ContradictionHintsParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.contradiction_hints(
                &self.sidecar,
                params.id_a.as_deref(),
                params.id_b.as_deref(),
                params.text_a.as_deref(),
                params.text_b.as_deref(),
                params.title_a.as_deref(),
                params.title_b.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Rerank candidate passages for a query (semantic + lexical). Pass passages from search/library_answer. Requires Local AI.")]
    fn passage_rerank(
        &self,
        Parameters(params): Parameters<tools::PassageRerankParams>,
    ) -> Result<String, String> {
        let passages = serde_json::to_value(&params.passages).map_err(|e| e.to_string())?;
        self.with_store(|store| {
            Ok(tools::json(&store.passage_rerank(
                &self.sidecar,
                &params.query,
                &passages,
                params.limit,
            )?))
        })
    }

    #[tool(description = "Suggest follow-up questions after a library/document answer. Pass answer sentences and/or citation passages. Requires Local AI.")]
    fn answer_followups(
        &self,
        Parameters(params): Parameters<tools::AnswerFollowupsParams>,
    ) -> Result<String, String> {
        let sentences = params
            .sentences
            .as_ref()
            .map(serde_json::to_value)
            .transpose()
            .map_err(|e| e.to_string())?;
        let passages = params
            .passages
            .as_ref()
            .map(serde_json::to_value)
            .transpose()
            .map_err(|e| e.to_string())?;
        self.with_store(|store| {
            Ok(tools::json(&store.answer_followups(
                &self.sidecar,
                &params.question,
                sentences.as_ref(),
                passages.as_ref(),
                params.scope.as_deref(),
                params.intent.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Rank open tasks / checklist items in a note by urgency cues. Python preferred; Rust offline fallback.")]
    fn rank_tasks(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.rank_tasks(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Find open loops / unfinished threads in a note. Python preferred; Rust offline fallback.")]
    fn open_loops(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.open_loops(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Build a short reading plan (sections / time boxes) for a note. Python preferred; Rust offline fallback.")]
    fn reading_plan(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.reading_plan(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Compact note pulse (density / tasks / dates signals) for a note id or plaintext.")]
    fn note_pulse(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.note_pulse(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
            )?))
        })
    }

    #[tool(description = "Tone pack (formality / energy / voice cues) for a note id or plaintext.")]
    fn tone_pack(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.tone_pack(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
            )?))
        })
    }
}
