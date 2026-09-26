mod embeddings;
mod fts;
mod library_scope;
mod links;
pub mod migrations;
mod revisions;
mod search;
pub use library_scope::{active_library_id, DEFAULT_LIBRARY_ID, META_ACTIVE_LIBRARY};
pub use search::{
    build_fts_query, filter_search_hits, fuse_search_hits, search_documents_for_library,
    search_documents_in_conn, SearchFilter, SearchHit, SearchMode,
};
pub mod test_helpers;

pub use embeddings::{
    cosine_similarity, count_embeddings, count_stale_embeddings, document_index_ready,
    dominant_embedding_model, get_answer_backend, get_document_embedding, get_embed_backend,
    is_nlp_enabled, list_embeddings, rank_document_chunks, remove_embedding, rerank_search_hits,
    save_artifact, semantic_search, semantic_search_filtered, set_answer_backend, set_embed_backend,
    set_nlp_enabled, similar_documents, upsert_embedding, upsert_embedding_with_chunks,
    EmbeddingChunkInput, RankedDocumentChunk, StoredEmbedding,
};
pub use fts::{
    backfill_fts, collect_document_ocr_text, document_index_text, extract_search_text,
    remove_document_fts, sync_document_fts,
};
pub use links::{backfill_links, sync_document_links};
pub use revisions::{fetch_revision, restore_document_content, save_revision, set_revision_label};
