mod chat_context;
mod memory;
mod parse;
mod sidecar;
mod types;

pub use chat_context::{
    followups_from_sidecar, is_chat_memory_citation_title, merge_chat_memory_passages, ChatTurn,
    DOCUMENT_CHAT_CONTEXT_LIMIT,
};
pub use memory::{
    collect_document_memory_passages, collect_library_memory_passages, persist_document_memory,
    persist_library_memory, DOCUMENT_MEMORY_KIND, LIBRARY_MEMORY_KIND,
};
pub use parse::{
    parse_chunks, parse_dates_result, parse_diff_summary, parse_document_analysis, parse_duplicates,
    parse_entities, parse_keywords_result, parse_language, parse_library_answer,
    parse_library_report, parse_mentions, parse_organize, parse_outline_result, parse_query_rewrite,
    parse_reading_stats, parse_rewrite_result, parse_sentiment, parse_spellcheck, parse_summary,
    parse_tasks, parse_template_hints, parse_title_suggestion, parse_wiki_suggestions,
};
pub use sidecar::{
    resolve_script_path, script_path_label, EmbedChunk, EmbedChunksResult, NlpHealth, NlpSidecar,
};
pub use types::{
    normalize_rewrite_mode, NlpAnswer, NlpCitation, NlpDateEvent, NlpDates, NlpDiffSummary,
    NlpDocumentAnalysis, NlpEntities, NlpEntity, NlpExtractedTask, NlpKeyword, NlpKeywordsResult,
    NlpChunks, NlpDuplicatePair, NlpDuplicates, NlpLanguage, NlpLibraryReport, NlpMentionEdge,
    NlpMentionLink, NlpMentions, NlpOrganize, NlpOrganizeSuggestion, NlpOutline, NlpOutlineItem,
    NlpQueryRewrite, NlpReadingStats, NlpRewriteResult, NlpSentiment, NlpSpellIssue, NlpSpellcheck,
    NlpSummary, NlpTasks, NlpTemplateHints, NlpTitleSuggestion, NlpWikiSuggestion,
    NlpWikiSuggestions, DEFAULT_REWRITE_MODE, REWRITE_MODES,
};
