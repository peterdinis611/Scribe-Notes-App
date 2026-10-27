use crate::server::ScribeMcp;
use crate::tools;

use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{GetPromptResult, PromptMessage, Role};
use rmcp::{prompt, prompt_router};


#[prompt_router(router = "prompt_router_main", vis = "pub(crate)")]
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
             1. Call wiki_health_report and list_graph_hubs.\n\
             2. Call suggest_wiki_resolutions for scored title matches.\n\
             3. For clear matches (score ≥ 0.72) use auto_resolve_wiki_links or resolve_wiki_link.\n\
             4. For missing targets use create_and_link_wiki_note.\n\
             5. For stubs use expand_stub_document.\n\
             Quote document ids. Writable tools need SCRIBE_MCP_WRITE=1.",
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

    #[prompt(description = "Analyze a note: full analysis, then keywords, takeaways, then organize.")]
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
                 3. Call extract_takeaways with the same id.\n\
                 4. Call suggest_organize with the same id.\n\
                 Summarize language, tone, keywords, takeaways, outline, and the best folder. Do not move the note unless I ask.",
                id = params.id
            ),
        )])
        .with_description("Analyze → keywords → takeaways → organize")
    }

    #[prompt(description = "Build study flashcards from a named note.")]
    fn study_flashcards(
        &self,
        Parameters(params): Parameters<tools::AnalyzeThisNoteParams>,
    ) -> GetPromptResult {
        GetPromptResult::new(vec![PromptMessage::new_text(
            Role::User,
            format!(
                "Build study flashcards from Scribe note {id}.\n\
                 1. Call extract_flashcards with id={id}.\n\
                 2. Present Q/A and cloze cards clearly.\n\
                 3. Optionally offer create_note for a deck — do not invent cards that were not returned.",
                id = params.id
            ),
        )])
        .with_description("Flashcards from a note")
    }

    #[prompt(description = "Writing-coach pass: style, terminology, spellcheck.")]
    fn writing_coach_pass(
        &self,
        Parameters(params): Parameters<tools::AnalyzeThisNoteParams>,
    ) -> GetPromptResult {
        GetPromptResult::new(vec![PromptMessage::new_text(
            Role::User,
            format!(
                "Run a writing-coach pass on Scribe note {id}.\n\
                 1. Call writing_coach with id={id}.\n\
                 2. Call check_terminology with the same id.\n\
                 3. Call spellcheck with the same id.\n\
                 Prioritize fixes. Do not rewrite the note unless I ask.",
                id = params.id
            ),
        )])
        .with_description("Style + terminology + spellcheck")
    }

    #[prompt(description = "Review a revision with Revision AI (changeKind and risks).")]
    fn revision_review(
        &self,
        Parameters(params): Parameters<tools::AnalyzeThisNoteParams>,
    ) -> GetPromptResult {
        GetPromptResult::new(vec![PromptMessage::new_text(
            Role::User,
            format!(
                "Review recent revisions of Scribe note {id}.\n\
                 1. Call list_document_revisions with id={id}.\n\
                 2. Pick the most recent useful revisionId.\n\
                 3. Call analyze_revision_diff_for_document (prefer over summarize_revision_diff).\n\
                 Explain changeKind, risks, and key bullets. Do not restore unless I ask.",
                id = params.id
            ),
        )])
        .with_description("Revision AI review")
    }

    #[prompt(description = "Run the Spellcheck Agent on a note (grammar teachings + spellcheck).")]
    fn spellcheck_agent_pass(
        &self,
        Parameters(params): Parameters<tools::IdParams>,
    ) -> GetPromptResult {
        GetPromptResult::new(vec![PromptMessage::new_text(
            Role::User,
            format!(
                "Run the Scribe Spellcheck Agent on note {id}.\n\
                 1. Call run_spellcheck_agent with documentId={id}.\n\
                 2. Summarize issues and suggested fixes.\n\
                 Respect grammar teachings in the answer. Do not rewrite the note unless I ask.",
                id = params.id
            ),
        )])
        .with_description("Spellcheck Agent pass")
    }

    #[prompt(description = "Suggest continue-writing phrases from the local library.")]
    fn continue_writing(
        &self,
        Parameters(params): Parameters<tools::SuggestContinuationParams>,
    ) -> GetPromptResult {
        let exclude = params
            .exclude_document_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|id| format!(" excludeDocumentId={id}"))
            .unwrap_or_default();
        GetPromptResult::new(vec![PromptMessage::new_text(
            Role::User,
            format!(
                "Suggest how to continue this Scribe draft.\n\
                 1. Call suggest_continuation with prefix={prefix:?}{exclude}.\n\
                 2. Show the suggestions only — do not append unless I ask.",
                prefix = params.prefix,
                exclude = exclude
            ),
        )])
        .with_description("Continue writing suggestions")
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

    #[prompt(description = "Review local audit log for errors, denials, and security events.")]
    fn audit_security_review(&self) -> GetPromptResult {
        GetPromptResult::new(vec![PromptMessage::new_text(
            Role::User,
            "Review my local Scribe audit log.\n\
             1. Call audit_status, then get_audit_stats.\n\
             2. Call list_audit_events with outcome=error (limit 40).\n\
             3. Call list_audit_events with outcome=denied (limit 40).\n\
             4. Call list_audit_events with category=security (limit 40).\n\
             5. Optionally export_audit_events_jsonl for the same filters if I ask for a dump.\n\
             Summarize clusters by action/actor. Quote event ids. Do not invent events.",
        )])
        .with_description("Audit errors, denials, security")
    }
}
