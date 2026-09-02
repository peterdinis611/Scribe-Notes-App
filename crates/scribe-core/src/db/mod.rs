mod embeddings;
mod fts;
mod links;
pub mod migrations;
mod revisions;
mod search;
pub use search::{build_fts_query, fuse_search_hits, search_documents_in_conn, SearchHit, SearchMode};
pub mod test_helpers;

pub use embeddings::{
    count_embeddings, count_stale_embeddings, dominant_embedding_model, get_document_embedding,
    get_embed_backend, is_nlp_enabled, remove_embedding, save_artifact, semantic_search,
    set_embed_backend, set_nlp_enabled, similar_documents, upsert_embedding,
};
pub use fts::{backfill_fts, extract_search_text, remove_document_fts, sync_document_fts};
pub use links::{backfill_links, sync_document_links};
pub use revisions::{fetch_revision, restore_document_content, save_revision};
