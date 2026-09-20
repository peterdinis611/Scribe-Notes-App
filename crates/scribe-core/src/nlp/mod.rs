mod chat_context;
mod document_passages;
mod duplicates;
pub mod jobs;
mod memory;
mod parse;
mod sidecar;
mod types;
pub mod vault_index;

pub use chat_context::{
    followups_from_sidecar, is_chat_memory_citation_title, merge_chat_memory_passages, ChatTurn,
    DOCUMENT_CHAT_CONTEXT_LIMIT, MERGED_PASSAGE_LIMIT,
};
pub use document_passages::{
    build_document_answer_passages, chunk_document_passages, DOCUMENT_ANSWER_PASSAGE_LIMIT,
    DOCUMENT_EMBED_RANK_LIMIT,
};
pub use duplicates::find_duplicates_from_embeddings;
pub use jobs::{
    collect_index_documents, index_collected_documents, persist_embedded_batch, prune_memory_artifacts,
    sync_embed_backend, IndexJobResult, NlpIndexProgress,
};
pub use memory::{
    collect_document_memory_passages, collect_library_memory_passages, persist_document_memory,
    persist_library_memory, prune_expired, DOCUMENT_MEMORY_KIND, LIBRARY_MEMORY_KIND,
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
pub use vault_index::{UnlockedVaultIndex, UnlockedVaultNote};
