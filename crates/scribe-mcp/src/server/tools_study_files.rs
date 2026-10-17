use crate::server::ScribeMcp;
use crate::tools;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::{tool, tool_router};


#[tool_router(router = router_study_files, vis = "pub(crate)")]
impl ScribeMcp {
    #[tool(description = "Extract study flashcards (Q&A, definitions, cloze, sections) from a note id or plaintext. Requires Local AI.")]
    fn extract_flashcards(
        &self,
        Parameters(params): Parameters<tools::ExtractFlashcardsParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.extract_flashcards(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
                params.include_cloze,
            )?))
        })
    }

    #[tool(description = "Find inconsistent terminology / casing variants in a note id or plaintext. Requires Local AI.")]
    fn check_terminology(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.check_terminology(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(
        description = "Apply grammar teachings to a note or plaintext (prefer/avoid/capitalize rules). Uses rules from scribe-agent when omitted. Requires Local AI."
    )]
    fn grammar_check(
        &self,
        Parameters(params): Parameters<tools::GrammarCheckParams>,
    ) -> Result<String, String> {
        let rules = match params.rules {
            Some(list) if !list.is_empty() => list,
            _ => self.grammar_rules_from_agent(),
        };
        self.with_store(|store| {
            Ok(tools::json(&store.grammar_check(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                &rules,
                params.limit,
            )?))
        })
    }

    #[tool(description = "Extract key takeaways / executive bullets from a note id or plaintext. Requires Local AI.")]
    fn extract_takeaways(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.extract_takeaways(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Local writing-coach style hints (long sentences, fillers, passive voice) for a note id or plaintext. Requires Local AI.")]
    fn writing_coach(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.writing_coach(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Explain a selection or note text in plain language. Optional LLM polish when enhanceHeuristics is on.")]
    fn explain_selection(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.explain_selection(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
            )?))
        })
    }

    #[tool(description = "Simplify a note or selection into shorter plain sentences.")]
    fn simplify(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.simplify_text(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
            )?))
        })
    }

    #[tool(description = "Extract action items from a note id or plaintext.")]
    fn action_items(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.action_items(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Build a glossary of terms and short definitions from a note.")]
    fn glossary(
        &self,
        Parameters(params): Parameters<tools::StudyLimitParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.glossary(
                &self.sidecar,
                params.id.as_deref(),
                params.text.as_deref(),
                params.limit,
            )?))
        })
    }

    #[tool(description = "Compare two notes (ids or plaintexts) and return a diff-style summary.")]
    fn compare_notes(
        &self,
        Parameters(params): Parameters<tools::CompareNotesParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.compare_notes(
                &self.sidecar,
                params.id_a.as_deref(),
                params.id_b.as_deref(),
                params.text_a.as_deref(),
                params.text_b.as_deref(),
                params.title_a.as_deref(),
                params.title_b.as_deref(),
            )?))
        })
    }

    #[tool(description = "List entries under the local files/ sandbox via Storage Files API (requires Files API running).")]
    fn files_list(
        &self,
        Parameters(params): Parameters<tools::FilesPathParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.files_list(
                &self.sidecar,
                params.path.as_deref().unwrap_or(""),
                params.recursive.unwrap_or(false),
                params.base_url.as_deref(),
            )?))
        })
    }

    #[tool(description = "Read a text file from the files/ sandbox (.md/.txt/.json/.csv).")]
    fn files_read_text(
        &self,
        Parameters(params): Parameters<tools::FilesReadParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.files_read_text(
                &self.sidecar,
                &params.path,
                params.base_url.as_deref(),
            )?))
        })
    }

    #[tool(description = "Search text files under files/ sandbox.")]
    fn files_search(
        &self,
        Parameters(params): Parameters<tools::FilesSearchParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.files_search(
                &self.sidecar,
                &params.query,
                params.path.as_deref(),
                params.glob.as_deref(),
                params.limit,
                params.base_url.as_deref(),
            )?))
        })
    }

    #[tool(description = "Summarize a text file under files/ sandbox.")]
    fn files_summarize(
        &self,
        Parameters(params): Parameters<tools::FilesSummarizeParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.files_summarize(
                &self.sidecar,
                &params.path,
                params.limit,
                params.base_url.as_deref(),
            )?))
        })
    }

    #[tool(description = "Answer a question over files/ sandbox with path citations. Returns FilesApiOffline if the Local Files API is not running.")]
    fn files_answer(
        &self,
        Parameters(params): Parameters<tools::FilesAnswerParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.files_answer(
                &self.sidecar,
                &params.question,
                params.path.as_deref(),
                params.limit,
                params.base_url.as_deref(),
            )?))
        })
    }

    #[tool(description = "Build/refresh path-scoped embeddings for files/ (namespace separate from note ids). Persists under scratch/.scribe-files-index.json.")]
    fn files_index(
        &self,
        Parameters(params): Parameters<tools::FilesIndexParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.files_index(
                &self.sidecar,
                params.path.as_deref().unwrap_or(""),
                params.limit_files,
                params.force.unwrap_or(false),
                params.base_url.as_deref(),
            )?))
        })
    }

    #[tool(description = "Compare the files/ embedding index with disk (stale / unindexed / missing). No embedding work. Requires Local Files API.")]
    fn files_index_status(
        &self,
        Parameters(params): Parameters<tools::FilesIndexStatusParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.files_index_status(
                &self.sidecar,
                params.path.as_deref().unwrap_or(""),
                params.scan_limit,
                params.base_url.as_deref(),
            )?))
        })
    }

    #[tool(description = "Find files whose indexed content is closest to a given path (mean chunk embedding). Run files_index first.")]
    fn files_similar(
        &self,
        Parameters(params): Parameters<tools::FilesSimilarParams>,
    ) -> Result<String, String> {
        self.with_store(|store| {
            Ok(tools::json(&store.files_similar(
                &self.sidecar,
                &params.path,
                params.scope.as_deref(),
                params.limit,
                params.base_url.as_deref(),
            )?))
        })
    }

    #[tool(description = "Clear files/ embedding index entries under path (all when path empty). Requires writable MCP + Local Files API.")]
    fn files_index_clear(
        &self,
        Parameters(params): Parameters<tools::FilesIndexClearParams>,
    ) -> Result<String, String> {
        if !self.writable {
            return Err("MCP is read-only (set SCRIBE_MCP_WRITE=1 to enable writes)".to_string());
        }
        self.with_store(|store| {
            Ok(tools::json(&store.files_index_clear(
                &self.sidecar,
                params.path.as_deref().unwrap_or(""),
                params.base_url.as_deref(),
            )?))
        })
    }
}
