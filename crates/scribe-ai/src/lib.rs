//! Pure AI context packing, agent routing, offline NLP fallbacks, and prompt helpers.
//!
//! No SQLite, no sidecar process, no Tauri — hosts own retrieval and model I/O.
//!
//! `scribe-core::nlp` re-exports this surface for compatibility.

mod agent_phases;
mod agent_slash;
mod budget;
mod chat_intent;
mod citation_pack;
mod commitments;
mod context;
mod continuation;
mod decisions;
mod duplicates;
mod forward_plan;
mod mentions;
mod normalize;
mod note_pulse;
mod open_loops;
mod passages;
mod pii;
mod placeholder;
mod prompts;
mod query_rewrite;
mod quotes;
mod reading_plan;
mod revision_ai;
mod section_summaries;
mod task_rank;
mod template_hints;
mod title;
mod tone;
mod tool_plan;
mod types;
mod vectors;

pub use agent_phases::{
    decode_phase_followup, encode_phase_followup, is_phase_followup, is_weak_agent_answer,
    normalize_plan_phases, now_tools_from_phases, phases_to_followups, AgentPhaseWhen,
    AgentPlanPhase, PHASE_PREFIX,
};
pub use agent_slash::{
    filter_agent_slash_commands, list_agent_slash_commands, parse_agent_slash, AgentSlashCommandDef,
    AgentSlashScope, ParsedAgentSlash,
};
pub use budget::{trim_passages_to_char_budget, DEFAULT_PASSAGE_CHAR_BUDGET};
pub use chat_intent::{match_agent_intents, match_document_chat_intent};
pub use citation_pack::{citation_pack, CitationDocInput, CitationPack};
pub use commitments::{extract_commitments, extract_commitments_value, NlpCommitment, NlpCommitments};
pub use context::{
    followups_from_sidecar, is_chat_memory_citation_title, merge_chat_memory_passages, ChatTurn,
    DOCUMENT_CHAT_CONTEXT_LIMIT, DOCUMENT_CHAT_RECENT_TURNS, MERGED_PASSAGE_LIMIT,
};
pub use continuation::{suggest_continuation, ContinuationResult, ContinuationSuggestion};
pub use decisions::{extract_decisions, extract_decisions_value};
pub use duplicates::{score_duplicate_pairs, EmbeddingDocRef};
pub use forward_plan::{
    forward_plan, forward_plan_value, NlpForwardCounts, NlpForwardItem, NlpForwardPlan,
};
pub use mentions::{extract_mentions, extract_mentions_value, NlpMentionsReport};
pub use normalize::{collapse_ws, fold_text, strip_diacritic};
pub use note_pulse::{note_pulse, note_pulse_value, NlpNotePulse};
pub use open_loops::{open_loops, open_loops_value, NlpOpenLoop, NlpOpenLoops};
pub use passages::{
    build_document_answer_passages, chunk_document_passages, DOCUMENT_ANSWER_PASSAGE_LIMIT,
    DOCUMENT_EMBED_RANK_LIMIT, DOCUMENT_PASSAGE_MAX, DOCUMENT_PASSAGE_TARGET_CHARS,
};
pub use pii::{detect_pii, detect_pii_value};
pub use placeholder::{
    generate_placeholder, PlaceholderLanguage, PlaceholderResult, PlaceholderUnit,
};
pub use prompts::{system_prompt, user_prompt, PromptKind};
pub use query_rewrite::{rewrite_query, QueryRewrite};
pub use quotes::{extract_quotes, extract_quotes_value};
pub use reading_plan::{reading_plan, reading_plan_value, NlpReadingPlan, NlpReadingStep};
pub use revision_ai::{
    analyze_revision_diff, RevisionAiBullet, RevisionAiReport, RevisionAiStats, RevisionChangeKind,
    RevisionHeadingChanges,
};
pub use section_summaries::{section_summaries, section_summaries_value};
pub use task_rank::{rank_tasks, rank_tasks_value, NlpRankedTask, NlpRankedTasks};
pub use template_hints::{template_fill_hints, template_fill_hints_value};
pub use title::{suggest_title, suggest_title_value};
pub use tone::{tone_pack, tone_pack_value, NlpTonePack};
pub use tool_plan::plan_tools_from_question;
pub use types::{
    NlpCitation, NlpDecision, NlpDecisions, NlpDuplicatePair, NlpDuplicates, NlpMentionEdge,
    NlpMentionLink, NlpMentions, NlpPiiFinding, NlpPiiReport, NlpQuote, NlpQuotes,
    NlpSectionSummaries, NlpSectionSummary, NlpTemplateHints, NlpTitleSuggestion, RankedPassageChunk,
};
pub use vectors::cosine_similarity;
