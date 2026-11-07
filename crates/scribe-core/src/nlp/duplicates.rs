//! Near-duplicates from stored document embeddings — no Python roundtrip.

use rusqlite::{params, Connection};

use crate::db::list_embeddings;
use crate::nlp::{NlpDuplicates};
use crate::vault::content_is_vault_cipher;
use scribe_ai::{score_duplicate_pairs, EmbeddingDocRef};

pub fn find_duplicates_from_embeddings(
    conn: &Connection,
    limit: i64,
    min_score: f64,
) -> Result<NlpDuplicates, String> {
    let mut embeddings = list_embeddings(conn)?;
    embeddings.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    embeddings.truncate(80);

    let mut docs = Vec::new();
    for item in embeddings {
        let row: Option<(String, String)> = conn
            .query_row(
                "SELECT title, content_json FROM documents WHERE id = ?1 AND deleted_at IS NULL",
                params![item.document_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();
        let Some((title, content_json)) = row else {
            continue;
        };
        if content_is_vault_cipher(&content_json) {
            continue;
        }
        docs.push((item, title));
    }

    let refs: Vec<EmbeddingDocRef<'_>> = docs
        .iter()
        .map(|(item, title)| EmbeddingDocRef {
            id: item.document_id.as_str(),
            title: title.as_str(),
            model: item.model.as_str(),
            vector: item.vector.as_slice(),
        })
        .collect();

    Ok(score_duplicate_pairs(
        &refs,
        limit.clamp(1, 40) as usize,
        min_score,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::in_memory_conn;
    use crate::db::upsert_embedding;

    #[test]
    fn scores_near_identical_vectors() {
        let conn = in_memory_conn();
        conn.execute(
            "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at)
             VALUES ('a', 'One', '{\"type\":\"doc\",\"content\":[]}', NULL, NULL, 1, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO documents (id, title, content_json, folder_id, file_path, created_at, updated_at)
             VALUES ('b', 'Two', '{\"type\":\"doc\",\"content\":[]}', NULL, NULL, 1, 1)",
            [],
        )
        .unwrap();
        let vector = vec![1.0f32, 0.0, 0.0, 0.2];
        upsert_embedding(&conn, "a", &vector, "test", 1).unwrap();
        upsert_embedding(&conn, "b", &vector, "test", 1).unwrap();
        let result = find_duplicates_from_embeddings(&conn, 8, 0.9).unwrap();
        assert_eq!(result.compared, 2);
        assert_eq!(result.pairs.len(), 1);
        assert!(result.pairs[0].score > 0.99);
    }
}
