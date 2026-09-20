//! Unlocked vault notes: plaintext lives in RAM only, never SQLite / FTS / embeddings.

use std::collections::HashMap;
use std::sync::Mutex;

use crate::db::SearchHit;

#[derive(Debug, Clone)]
pub struct UnlockedVaultNote {
    pub document_id: String,
    pub folder_id: String,
    pub title: String,
    pub text: String,
}

#[derive(Debug, Default)]
pub struct UnlockedVaultIndex {
    notes: Mutex<HashMap<String, UnlockedVaultNote>>,
}

impl UnlockedVaultIndex {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn upsert(&self, note: UnlockedVaultNote) {
        if let Ok(mut map) = self.notes.lock() {
            map.insert(note.document_id.clone(), note);
        }
    }

    pub fn remove(&self, document_id: &str) {
        if let Ok(mut map) = self.notes.lock() {
            map.remove(document_id);
        }
    }

    pub fn clear_folder(&self, folder_id: &str) {
        if let Ok(mut map) = self.notes.lock() {
            map.retain(|_, note| note.folder_id != folder_id);
        }
    }

    pub fn clear_all(&self) {
        if let Ok(mut map) = self.notes.lock() {
            map.clear();
        }
    }

    pub fn search(&self, query: &str, limit: i64, folder_id: Option<&str>) -> Vec<SearchHit> {
        let q = query.trim().to_lowercase();
        if q.is_empty() {
            return Vec::new();
        }
        let terms: Vec<&str> = q.split_whitespace().collect();
        let Ok(map) = self.notes.lock() else {
            return Vec::new();
        };
        let mut hits: Vec<(i32, SearchHit)> = Vec::new();
        for note in map.values() {
            if let Some(wanted) = folder_id.map(str::trim).filter(|v| !v.is_empty()) {
                if note.folder_id != wanted {
                    continue;
                }
            }
            let hay = format!("{} {}", note.title, note.text).to_lowercase();
            let score = terms.iter().filter(|term| hay.contains(*term)).count() as i32;
            if score == 0 {
                continue;
            }
            let snippet = note
                .text
                .chars()
                .take(160)
                .collect::<String>();
            hits.push((
                score,
                SearchHit {
                    document_id: note.document_id.clone(),
                    title: note.title.clone(),
                    snippet,
                    rank: -(score as f64),
                    match_kind: Some("vault-ram".into()),
                    chunk_index: None,
                },
            ));
        }
        hits.sort_by(|a, b| b.0.cmp(&a.0));
        hits.truncate(limit.clamp(1, 20) as usize);
        hits.into_iter().map(|(_, hit)| hit).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ram_index_never_persists_and_matches_terms() {
        let index = UnlockedVaultIndex::new();
        index.upsert(UnlockedVaultNote {
            document_id: "v1".into(),
            folder_id: "f1".into(),
            title: "Secret".into(),
            text: "The atlas deadline is Friday".into(),
        });
        let hits = index.search("atlas friday", 8, None);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].document_id, "v1");
        index.clear_folder("f1");
        assert!(index.search("atlas", 8, None).is_empty());
    }
}
