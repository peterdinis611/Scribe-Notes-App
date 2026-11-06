//! Pure AI context packing for Scribe.
//!
//! Shapes chat turns and document passages for prompts. No SQLite, no sidecar
//! process, no Tauri — hosts own retrieval and model I/O.
//!
//! `scribe-core::nlp` re-exports this surface for compatibility.

mod context;
mod passages;
mod types;

pub use context::{
    followups_from_sidecar, is_chat_memory_citation_title, merge_chat_memory_passages, ChatTurn,
    DOCUMENT_CHAT_CONTEXT_LIMIT, DOCUMENT_CHAT_RECENT_TURNS, MERGED_PASSAGE_LIMIT,
};
pub use passages::{
    build_document_answer_passages, chunk_document_passages, DOCUMENT_ANSWER_PASSAGE_LIMIT,
    DOCUMENT_EMBED_RANK_LIMIT, DOCUMENT_PASSAGE_MAX, DOCUMENT_PASSAGE_TARGET_CHARS,
};
pub use types::RankedPassageChunk;
