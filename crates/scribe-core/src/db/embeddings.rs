use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::HashMap;

use crate::db::fts::extract_search_text;
use crate::db::search::SearchHit;

pub const META_NLP_ENABLED: &str = "nlp_enabled";
pub const META_NLP_EMBED_BACKEND: &str = "nlp_embed_backend";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredEmbedding {
    pub document_id: String,
    pub vector: Vec<f32>,
    pub model: String,
    pub dims: i32,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct StoredChunkEmbedding {
    pub document_id: String,
    pub chunk_index: i32,
    pub vector: Vec<f32>,
    pub model: String,
    pub dims: i32,
    pub snippet: String,
    pub updated_at: i64,
}

/// Chunk payload for upsert (keeps `db` free of NLP types).
#[derive(Debug, Clone)]
pub struct EmbeddingChunkInput {
    pub index: i32,
    pub text: String,
    pub vector: Vec<f32>,
}

pub fn is_nlp_enabled(conn: &Connection) -> Result<bool, String> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE key = ?1",
            params![META_NLP_ENABLED],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(matches!(value.as_deref(), Some("1") | Some("true")))
}

pub fn set_nlp_enabled(conn: &Connection, enabled: bool) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
        params![META_NLP_ENABLED, if enabled { "1" } else { "0" }],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_embed_backend(conn: &Connection) -> Result<String, String> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM meta WHERE key = ?1",
            params![META_NLP_EMBED_BACKEND],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(value.unwrap_or_else(|| "hash".to_string()))
}

pub fn set_embed_backend(conn: &Connection, backend: &str) -> Result<(), String> {
    let normalized = if backend == "quality" { "quality" } else { "hash" };
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
        params![META_NLP_EMBED_BACKEND, normalized],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_document_embedding(
    conn: &Connection,
    document_id: &str,
) -> Result<Option<StoredEmbedding>, String> {
    conn.query_row(
        "SELECT document_id, embedding, model, dims, updated_at
         FROM document_embeddings WHERE document_id = ?1",
        params![document_id],
        |row| {
            let blob: Vec<u8> = row.get(1)?;
            Ok(StoredEmbedding {
                document_id: row.get(0)?,
                vector: blob_to_vector(&blob).map_err(|error| {
                    rusqlite::Error::ToSqlConversionFailure(Box::from(error))
                })?,
                model: row.get(2)?,
                dims: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn similar_documents(
    conn: &Connection,
    document_id: &str,
    limit: i64,
    model: Option<&str>,
) -> Result<Vec<SearchHit>, String> {
    let Some(embedding) = get_document_embedding(conn, document_id)? else {
        return Ok(Vec::new());
    };

    let max = limit.clamp(1, 20);
    let mut hits = semantic_search(conn, &embedding.vector, max + 1, model)?;
    hits.retain(|hit| hit.document_id != document_id);
    hits.truncate(max as usize);
    Ok(hits)
}

pub fn count_embeddings(conn: &Connection) -> Result<i64, String> {
    conn.query_row("SELECT COUNT(*) FROM document_embeddings", [], |row| row.get(0))
        .map_err(|e| e.to_string())
}

pub fn dominant_embedding_model(conn: &Connection) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT model FROM document_embeddings
         GROUP BY model
         ORDER BY COUNT(*) DESC
         LIMIT 1",
        [],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn count_stale_embeddings(conn: &Connection, current_model: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM document_embeddings WHERE model != ?1",
        params![current_model],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

fn vector_to_blob(vector: &[f32]) -> Vec<u8> {
    vector.iter().flat_map(|value| value.to_le_bytes()).collect()
}

fn blob_to_vector(blob: &[u8]) -> Result<Vec<f32>, String> {
    if blob.len() % 4 != 0 {
        return Err("Invalid embedding blob length".to_string());
    }
    let mut vector = Vec::with_capacity(blob.len() / 4);
    for chunk in blob.chunks_exact(4) {
        vector.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
    }
    Ok(vector)
}

pub fn upsert_embedding(
    conn: &Connection,
    document_id: &str,
    vector: &[f32],
    model: &str,
    updated_at: i64,
) -> Result<(), String> {
    let dims = vector.len() as i32;
    conn.execute(
        "INSERT INTO document_embeddings (document_id, embedding, dims, model, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(document_id) DO UPDATE SET
           embedding = excluded.embedding,
           dims = excluded.dims,
           model = excluded.model,
           updated_at = excluded.updated_at",
        params![
            document_id,
            vector_to_blob(vector),
            dims,
            model,
            updated_at
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn upsert_embedding_with_chunks(
    conn: &Connection,
    document_id: &str,
    document_vector: &[f32],
    chunks: &[EmbeddingChunkInput],
    model: &str,
    updated_at: i64,
) -> Result<(), String> {
    upsert_embedding(conn, document_id, document_vector, model, updated_at)?;
    conn.execute(
        "DELETE FROM document_embedding_chunks WHERE document_id = ?1",
        params![document_id],
    )
    .map_err(|e| e.to_string())?;

    for chunk in chunks {
        let snippet: String = chunk.text.chars().take(240).collect();
        conn.execute(
            "INSERT INTO document_embedding_chunks
             (document_id, chunk_index, embedding, dims, model, snippet, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                document_id,
                chunk.index,
                vector_to_blob(&chunk.vector),
                chunk.vector.len() as i32,
                model,
                snippet,
                updated_at
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn remove_embedding(conn: &Connection, document_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM document_embedding_chunks WHERE document_id = ?1",
        params![document_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM document_embeddings WHERE document_id = ?1",
        params![document_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_embeddings(conn: &Connection) -> Result<Vec<StoredEmbedding>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT document_id, embedding, model, dims, updated_at
             FROM document_embeddings",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let blob: Vec<u8> = row.get(1)?;
            Ok(StoredEmbedding {
                document_id: row.get(0)?,
                vector: blob_to_vector(&blob).map_err(|error| {
                    rusqlite::Error::ToSqlConversionFailure(Box::from(error))
                })?,
                model: row.get(2)?,
                dims: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn list_chunk_embeddings(conn: &Connection) -> Result<Vec<StoredChunkEmbedding>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT document_id, chunk_index, embedding, model, dims, snippet, updated_at
             FROM document_embedding_chunks",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let blob: Vec<u8> = row.get(2)?;
            Ok(StoredChunkEmbedding {
                document_id: row.get(0)?,
                chunk_index: row.get(1)?,
                vector: blob_to_vector(&blob).map_err(|error| {
                    rusqlite::Error::ToSqlConversionFailure(Box::from(error))
                })?,
                model: row.get(3)?,
                dims: row.get(4)?,
                snippet: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f64;
    let mut norm_a = 0.0f64;
    let mut norm_b = 0.0f64;
    for (left, right) in a.iter().zip(b.iter()) {
        let l = f64::from(*left);
        let r = f64::from(*right);
        dot += l * r;
        norm_a += l * l;
        norm_b += r * r;
    }
    if norm_a <= 0.0 || norm_b <= 0.0 {
        return 0.0;
    }
    dot / (norm_a.sqrt() * norm_b.sqrt())
}

pub fn semantic_search(
    conn: &Connection,
    query_vector: &[f32],
    limit: i64,
    model: Option<&str>,
) -> Result<Vec<SearchHit>, String> {
    let max = limit.clamp(1, 50);
    let chunks = list_chunk_embeddings(conn)?;
    if !chunks.is_empty() {
        return semantic_search_chunks(conn, query_vector, max, model, &chunks);
    }
    semantic_search_documents(conn, query_vector, max, model)
}

fn semantic_search_chunks(
    conn: &Connection,
    query_vector: &[f32],
    max: i64,
    model: Option<&str>,
    chunks: &[StoredChunkEmbedding],
) -> Result<Vec<SearchHit>, String> {
    let mut best: HashMap<String, (f64, String)> = HashMap::new();
    for chunk in chunks {
        if model.is_some_and(|expected| chunk.model != expected) {
            continue;
        }
        if chunk.vector.len() != query_vector.len() {
            continue;
        }
        let score = cosine_similarity(query_vector, &chunk.vector);
        if score <= 0.05 {
            continue;
        }
        let snippet = if chunk.snippet.trim().is_empty() {
            String::new()
        } else {
            chunk.snippet.clone()
        };
        match best.get(&chunk.document_id) {
            Some((prev, _)) if *prev >= score => {}
            _ => {
                best.insert(chunk.document_id.clone(), (score, snippet));
            }
        }
    }

    let mut scored: Vec<(f64, String, String)> = best
        .into_iter()
        .map(|(document_id, (score, snippet))| (score, document_id, snippet))
        .collect();
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(max as usize);

    let mut hits = Vec::with_capacity(scored.len());
    for (score, document_id, snippet) in scored {
        let (title, content_json): (String, String) = conn
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;

        let body_snippet = if snippet.trim().is_empty() {
            extract_search_text(&content_json)
                .chars()
                .take(120)
                .collect::<String>()
        } else {
            snippet.chars().take(160).collect()
        };
        hits.push(SearchHit {
            document_id,
            title,
            snippet: body_snippet,
            rank: -score,
            match_kind: Some("semantic".to_string()),
        });
    }

    Ok(hits)
}

fn semantic_search_documents(
    conn: &Connection,
    query_vector: &[f32],
    max: i64,
    model: Option<&str>,
) -> Result<Vec<SearchHit>, String> {
    let mut scored: Vec<(f64, StoredEmbedding)> = list_embeddings(conn)?
        .into_iter()
        .filter(|item| model.map_or(true, |expected| item.model == expected))
        .filter(|item| item.vector.len() == query_vector.len())
        .map(|item| {
            let score = cosine_similarity(query_vector, &item.vector);
            (score, item)
        })
        .filter(|(score, _)| *score > 0.05)
        .collect();

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(max as usize);

    let mut hits = Vec::with_capacity(scored.len());
    for (score, embedding) in scored {
        let (title, content_json): (String, String) = conn
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![embedding.document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;

        let body = extract_search_text(&content_json);
        let snippet = body.chars().take(120).collect::<String>();
        hits.push(SearchHit {
            document_id: embedding.document_id,
            title,
            snippet,
            rank: -score,
            match_kind: Some("semantic".to_string()),
        });
    }

    Ok(hits)
}

pub fn save_artifact(
    conn: &Connection,
    id: &str,
    kind: &str,
    payload_json: &str,
    created_at: i64,
) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO nlp_artifacts (id, kind, payload_json, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![id, kind, payload_json, created_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;
    use crate::db::test_helpers::in_memory_conn;

    #[test]
    fn embedding_round_trip_and_search() {
        let conn = in_memory_conn();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at)
             VALUES ('d1', 'Rust notes', '{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"memory safety systems\"}]}]}', NULL, NULL, 1, 1)",
            [],
        )
        .unwrap();

        let vector = vec![1.0f32, 0.0, 0.0];
        upsert_embedding(&conn, "d1", &vector, "test", 1).unwrap();
        let hits = semantic_search(&conn, &vector, 5, Some("test")).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].document_id, "d1");
    }

    #[test]
    fn chunk_search_uses_best_snippet() {
        let conn = in_memory_conn();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at)
             VALUES ('d1', 'Long note', '{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"alpha beta\"}]}]}', NULL, NULL, 1, 1)",
            [],
        )
        .unwrap();

        let doc_vector = vec![0.5f32, 0.5, 0.0];
        let chunks = vec![
            EmbeddingChunkInput {
                index: 0,
                text: "unrelated intro fluff".into(),
                vector: vec![0.0f32, 1.0, 0.0],
            },
            EmbeddingChunkInput {
                index: 1,
                text: "memory safety systems programming".into(),
                vector: vec![1.0f32, 0.0, 0.0],
            },
        ];
        upsert_embedding_with_chunks(&conn, "d1", &doc_vector, &chunks, "test", 1).unwrap();

        let hits = semantic_search(&conn, &[1.0f32, 0.0, 0.0], 5, Some("test")).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].snippet.contains("memory safety"));
    }

    #[test]
    fn dominant_model_and_stale_counts() {
        let conn = in_memory_conn();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at)
             VALUES ('d1', 'One', '{}', NULL, NULL, 1, 1),
                    ('d2', 'Two', '{}', NULL, NULL, 1, 1),
                    ('d3', 'Three', '{}', NULL, NULL, 1, 1)",
            [],
        )
        .unwrap();
        let vector = vec![1.0f32, 0.0, 0.0];
        upsert_embedding(&conn, "d1", &vector, "scribe-hash-v1", 1).unwrap();
        upsert_embedding(&conn, "d2", &vector, "scribe-hash-v1", 1).unwrap();
        upsert_embedding(&conn, "d3", &vector, "scribe-hash-v2", 1).unwrap();

        assert_eq!(
            dominant_embedding_model(&conn).unwrap().as_deref(),
            Some("scribe-hash-v1")
        );
        assert_eq!(count_stale_embeddings(&conn, "scribe-hash-v2").unwrap(), 2);
    }

    #[test]
    fn similar_documents_excludes_self() {
        let conn = in_memory_conn();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at)
             VALUES ('d1', 'Alpha', '{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"alpha topic\"}]}]}', NULL, NULL, 1, 1),
                    ('d2', 'Beta', '{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"beta topic\"}]}]}', NULL, NULL, 1, 1)",
            [],
        )
        .unwrap();

        let vector_a = vec![1.0f32, 0.0, 0.0];
        let vector_b = vec![0.9f32, 0.1, 0.0];
        upsert_embedding(&conn, "d1", &vector_a, "test", 1).unwrap();
        upsert_embedding(&conn, "d2", &vector_b, "test", 1).unwrap();

        let hits = similar_documents(&conn, "d1", 8, Some("test")).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].document_id, "d2");
    }
}
