//! Shared AI DTOs that hosts fill from DB / sidecar results.

/// One ranked chunk from embedding (or other) retrieval — host-owned data, AI-shaped.
#[derive(Debug, Clone)]
pub struct RankedPassageChunk {
    pub snippet: String,
    pub score: f64,
    pub chunk_index: i32,
}

impl RankedPassageChunk {
    pub fn new(snippet: impl Into<String>, score: f64, chunk_index: i32) -> Self {
        Self {
            snippet: snippet.into(),
            score,
            chunk_index,
        }
    }
}
