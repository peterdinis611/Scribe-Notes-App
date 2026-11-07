//! Near-duplicate scoring over in-memory embedding refs (no DB).

use crate::types::{NlpDuplicatePair, NlpDuplicates};
use crate::vectors::cosine_similarity;

/// One document embedding already loaded by the host.
#[derive(Debug, Clone, Copy)]
pub struct EmbeddingDocRef<'a> {
    pub id: &'a str,
    pub title: &'a str,
    pub model: &'a str,
    pub vector: &'a [f32],
}

/// Pairwise cosine scoring; host supplies filtered docs (no vault/DB here).
pub fn score_duplicate_pairs(
    docs: &[EmbeddingDocRef<'_>],
    limit: usize,
    min_score: f64,
) -> NlpDuplicates {
    let compared = docs.len() as i64;
    let mut pairs = Vec::new();
    for left in 0..docs.len() {
        for right in (left + 1)..docs.len() {
            if docs[left].vector.len() != docs[right].vector.len() {
                continue;
            }
            if docs[left].model != docs[right].model {
                continue;
            }
            let score = cosine_similarity(docs[left].vector, docs[right].vector);
            if score < min_score {
                continue;
            }
            pairs.push(NlpDuplicatePair {
                left_id: docs[left].id.to_string(),
                left_title: docs[left].title.to_string(),
                right_id: docs[right].id.to_string(),
                right_title: docs[right].title.to_string(),
                score,
                jaccard: 0.0,
                embed_score: score,
            });
        }
    }
    pairs.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    pairs.truncate(limit.clamp(1, 40));
    NlpDuplicates { pairs, compared }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scores_near_identical_vectors() {
        let vector = [1.0f32, 0.0, 0.0, 0.2];
        let docs = [
            EmbeddingDocRef {
                id: "a",
                title: "One",
                model: "test",
                vector: &vector,
            },
            EmbeddingDocRef {
                id: "b",
                title: "Two",
                model: "test",
                vector: &vector,
            },
        ];
        let result = score_duplicate_pairs(&docs, 8, 0.9);
        assert_eq!(result.compared, 2);
        assert_eq!(result.pairs.len(), 1);
        assert!(result.pairs[0].score > 0.99);
    }
}
