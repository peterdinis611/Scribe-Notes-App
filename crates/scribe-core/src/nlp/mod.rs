mod duplicates;
pub mod jobs;
mod memory;
mod parse;
mod seatbelt;
mod sidecar;
mod types;
pub mod vault_index;

// Pure AI extractors / routing / context packing live in `scribe-ai`.
pub use scribe_ai::{
    analyze_revision_diff, build_document_answer_passages, chunk_document_passages, citation_pack,
    decode_phase_followup, detect_pii, encode_phase_followup, extract_commitments, extract_decisions,
    extract_mentions, extract_quotes, filter_agent_slash_commands, followups_from_sidecar,
    forward_plan, generate_placeholder, is_chat_memory_citation_title, is_phase_followup,
    is_weak_agent_answer, list_agent_slash_commands, match_agent_intents, match_document_chat_intent,
    merge_chat_memory_passages, normalize_plan_phases, note_pulse, now_tools_from_phases, open_loops,
    parse_agent_slash, phases_to_followups, plan_tools_from_question, rank_tasks, reading_plan,
    roadmap, roadmap_to_markdown, roadmap_value, rewrite_query, score_duplicate_pairs,
    section_summaries, suggest_continuation, suggest_title,
    system_prompt, template_fill_hints, template_fill_hints_value, tone_pack, trim_passages_to_char_budget,
    user_prompt, collapse_ws, fold_text, strip_diacritic, AgentPhaseWhen, AgentPlanPhase,
    AgentSlashCommandDef, AgentSlashScope, ChatTurn,
    CitationDocInput, CitationPack, ContinuationResult, ContinuationSuggestion, EmbeddingDocRef,
    NlpCitation, NlpCommitment, NlpCommitments, NlpDecision, NlpDecisions, NlpDuplicatePair,
    NlpDuplicates, NlpForwardCounts, NlpForwardItem, NlpForwardPlan, NlpMentionEdge, NlpMentionLink,
    NlpMentions, NlpMentionsReport, NlpNotePulse, NlpOpenLoop, NlpOpenLoops, NlpPiiFinding, NlpPiiReport,
    NlpQuote, NlpQuotes, NlpRankedTask, NlpRankedTasks, NlpReadingPlan, NlpReadingStep, NlpRoadmap,
    NlpRoadmapItem, NlpRoadmapPhase, NlpSectionSummaries, NlpSectionSummary, NlpTemplateHints,
    NlpTitleSuggestion, NlpTonePack,
    ParsedAgentSlash, PlaceholderLanguage, PlaceholderResult, PlaceholderUnit, PromptKind, QueryRewrite,
    RankedPassageChunk, RevisionAiBullet, RevisionAiReport, RevisionAiStats, RevisionChangeKind,
    RevisionHeadingChanges, DOCUMENT_ANSWER_PASSAGE_LIMIT, DOCUMENT_CHAT_CONTEXT_LIMIT,
    DOCUMENT_EMBED_RANK_LIMIT, DOCUMENT_PASSAGE_MAX, DOCUMENT_PASSAGE_TARGET_CHARS,
    DEFAULT_PASSAGE_CHAR_BUDGET, MERGED_PASSAGE_LIMIT, PHASE_PREFIX,
};
pub use duplicates::find_duplicates_from_embeddings;
pub use jobs::{
    collect_index_documents, document_needs_reindex, ensure_document_indexed, index_collected_documents,
    index_document_now, persist_embedded_batch, prune_memory_artifacts, resolve_answer_embed_backend,
    sync_embed_backend, IndexJobResult, NlpIndexProgress,
};
pub use memory::{
    collect_document_memory_passages, collect_library_memory_passages, persist_document_memory,
    persist_library_memory, prune_expired, DOCUMENT_MEMORY_KIND, LIBRARY_MEMORY_KIND,
};
pub use parse::{
    parse_chunks, parse_contradiction_hints, parse_dates_result, parse_decisions, parse_diff_summary,
    parse_document_analysis, parse_duplicates, parse_entities, parse_keywords_result,
    parse_language, parse_library_answer, parse_library_report, parse_mentions, parse_organize,
    parse_outline_result, parse_pii_report, parse_query_rewrite, parse_quotes, parse_ranked_tasks,
    parse_reading_stats, parse_rewrite_result, parse_section_summaries, parse_sentiment,
    parse_spellcheck, parse_summary, parse_tasks, parse_template_hints, parse_title_suggestion,
    parse_wiki_suggestions,
};
pub use sidecar::{
    resolve_script_path, script_path_label, EmbedChunk, EmbedChunksResult, NlpHealth, NlpSidecar,
};
pub use types::{
    normalize_rewrite_mode,
    NlpAnswer,
    NlpChunks,
    NlpContradictionHint,
    NlpContradictionHints,
    NlpDateEvent,
    NlpDates,
    NlpDiffModifiedSentence,
    NlpDiffSummary,
    NlpDocumentAnalysis,
    NlpEntities,
    NlpEntity,
    NlpExtractedTask,
    NlpKeyword,
    NlpKeywordsResult,
    NlpLanguage,
    NlpLibraryReport,
    NlpOrganize,
    NlpOrganizeSuggestion,
    NlpOutline,
    NlpOutlineItem,
    NlpQueryRewrite,
    NlpReadingStats,
    NlpRewriteResult,
    NlpSentiment,
    NlpSpellIssue,
    NlpSpellcheck,
    NlpSummary,
    NlpTasks,
    NlpWikiSuggestion,
    NlpWikiSuggestions,
    DEFAULT_REWRITE_MODE,
    REWRITE_MODES,
};
pub use vault_index::{UnlockedVaultIndex, UnlockedVaultNote};
