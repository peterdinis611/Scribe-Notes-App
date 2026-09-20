//! Reindex jobs shared by Tauri and MCP. Sidecar RPCs never hold the DB lock.

use rusqlite::Connection;
use serde::Serialize;

use crate::db::{
    document_index_text, get_embed_backend, upsert_embedding_with_chunks, EmbeddingChunkInput,
};
use crate::nlp::{EmbedChunksResult, NlpSidecar};
use crate::vault::content_is_vault_cipher;

const BATCH_SIZE: usize = 24;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NlpIndexProgress {
    pub current: i64,
    pub total: i64,
    pub phase: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexJobResult {
    pub indexed: i64,
    pub model: String,
}

pub fn sync_embed_backend(conn: &Connection, sidecar: &NlpSidecar) -> Result<(), String> {
    let backend = get_embed_backend(conn)?;
    sidecar.configure_embed_backend(&backend)
}

/// Title + body + OCR text for each active document, optional library / vault skip.
pub fn collect_index_documents(
    conn: &Connection,
    library_id: Option<&str>,
    skip_vault: bool,
) -> Result<Vec<(String, String)>, String> {
    let mut pending: Vec<(String, String, String)> = Vec::new();
    if let Some(library_id) = library_id {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, content_json FROM documents
                 WHERE deleted_at IS NULL AND library_id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([library_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            pending.push(row.map_err(|e| e.to_string())?);
        }
    } else {
        let mut stmt = conn
            .prepare("SELECT id, title, content_json FROM documents WHERE deleted_at IS NULL")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            pending.push(row.map_err(|e| e.to_string())?);
        }
    }

    let mut docs = Vec::new();
    for (id, title, content_json) in pending {
        if skip_vault && content_is_vault_cipher(&content_json) {
            continue;
        }
        let text = document_index_text(conn, &id, &title, &content_json);
        docs.push((id, text));
    }
    Ok(docs)
}

pub fn persist_embedded_batch(
    conn: &Connection,
    ids: &[String],
    results: Vec<EmbedChunksResult>,
    model: &str,
    now: i64,
) -> Result<i64, String> {
    let mut indexed = 0i64;
    for (document_id, embedded) in ids.iter().zip(results.into_iter()) {
        let chunks: Vec<EmbeddingChunkInput> = embedded
            .chunks
            .into_iter()
            .map(|chunk| EmbeddingChunkInput {
                index: chunk.index,
                text: chunk.text,
                vector: chunk.vector,
            })
            .collect();
        upsert_embedding_with_chunks(conn, document_id, &embedded.vector, &chunks, model, now)?;
        indexed += 1;
    }
    Ok(indexed)
}

/// Embed collected documents in batches. `persist` runs after each batch (lock DB there).
pub fn index_collected_documents(
    sidecar: &NlpSidecar,
    docs: Vec<(String, String)>,
    mut persist: impl FnMut(&[String], Vec<EmbedChunksResult>, &str) -> Result<(), String>,
    mut on_progress: impl FnMut(&NlpIndexProgress),
) -> Result<IndexJobResult, String> {
    let total = docs.len() as i64;
    on_progress(&NlpIndexProgress {
        current: 0,
        total,
        phase: "starting".into(),
    });
    if docs.is_empty() {
        on_progress(&NlpIndexProgress {
            current: 0,
            total: 0,
            phase: "done".into(),
        });
        return Ok(IndexJobResult {
            indexed: 0,
            model: "none".into(),
        });
    }

    let mut indexed = 0i64;
    let mut model = "none".to_string();
    for chunk in docs.chunks(BATCH_SIZE) {
        let ids: Vec<String> = chunk.iter().map(|(id, _)| id.clone()).collect();
        let texts: Vec<String> = chunk.iter().map(|(_, text)| text.clone()).collect();
        let (results, batch_model) = sidecar.embed_batch_with_chunks(&texts)?;
        model = batch_model;
        persist(&ids, results, &model)?;
        indexed += ids.len() as i64;
        on_progress(&NlpIndexProgress {
            current: indexed,
            total,
            phase: "indexing".into(),
        });
    }
    on_progress(&NlpIndexProgress {
        current: total,
        total,
        phase: "done".into(),
    });
    Ok(IndexJobResult { indexed, model })
}

pub fn prune_memory_artifacts(conn: &Connection) -> Result<i64, String> {
    crate::nlp::memory::prune_expired(conn)
}
