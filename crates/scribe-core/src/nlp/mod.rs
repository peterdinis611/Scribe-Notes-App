mod chat_context;
mod sidecar;

pub use chat_context::{
    followups_from_sidecar, is_chat_memory_citation_title, merge_chat_memory_passages, ChatTurn,
    DOCUMENT_CHAT_CONTEXT_LIMIT,
};
pub use sidecar::{
    resolve_script_path, script_path_label, EmbedChunk, EmbedChunksResult, NlpHealth, NlpSidecar,
};
