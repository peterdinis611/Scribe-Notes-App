//! Suggest link targets for orphan notes (`suggestOrphanLinks` in `link-graph/orphan-cleanup.ts`).
//! Untitled detection / partitioning already lives in `graph.rs`.

use serde::{Deserialize, Serialize};

/// Search hit subset used for suggestions (mirrors FE `SearchHit`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OrphanSimilarHit {
    #[serde(default)]
    pub document_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub rank: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OrphanSuggestionRow {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub similar: Vec<OrphanSimilarHit>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OrphanLinkSuggestion {
    pub orphan_id: String,
    pub orphan_title: String,
    pub target_id: String,
    pub target_title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rank: Option<f64>,
}

/// Pick the best similar non-orphan target (first hit with an id other than the orphan itself).
pub fn suggest_orphan_links(rows: &[OrphanSuggestionRow]) -> Vec<OrphanLinkSuggestion> {
    rows.iter()
        .filter_map(|row| {
            let hit = row
                .similar
                .iter()
                .find(|hit| !hit.document_id.is_empty() && hit.document_id != row.id)?;
            Some(OrphanLinkSuggestion {
                orphan_id: row.id.clone(),
                orphan_title: row.title.clone(),
                target_id: hit.document_id.clone(),
                target_title: if hit.title.is_empty() { "Note".to_string() } else { hit.title.clone() },
                rank: hit.rank,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hit(id: &str, title: &str, rank: Option<f64>) -> OrphanSimilarHit {
        OrphanSimilarHit { document_id: id.into(), title: title.into(), rank }
    }

    #[test]
    fn skips_self_and_empty_ids() {
        let rows = vec![OrphanSuggestionRow {
            id: "a".into(),
            title: "A".into(),
            similar: vec![hit("a", "A", None), hit("", "x", None), hit("b", "B", Some(1.5))],
        }];
        let out = suggest_orphan_links(&rows);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].target_id, "b");
        assert_eq!(out[0].rank, Some(1.5));
    }

    #[test]
    fn no_candidate_skips_row_and_titles_fallback() {
        let rows = vec![
            OrphanSuggestionRow { id: "a".into(), title: "A".into(), similar: vec![hit("a", "A", None)] },
            OrphanSuggestionRow { id: "c".into(), title: "C".into(), similar: vec![hit("d", "", None)] },
        ];
        let out = suggest_orphan_links(&rows);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].orphan_id, "c");
        assert_eq!(out[0].target_title, "Note");
    }

    #[test]
    fn deserializes_camel_case() {
        let rows: Vec<OrphanSuggestionRow> = serde_json::from_str(
            r#"[{"id":"a","title":"A","similar":[{"documentId":"b","title":"B","snippet":"x","rank":2}]}]"#,
        )
        .unwrap();
        let out = suggest_orphan_links(&rows);
        let json = serde_json::to_value(&out[0]).unwrap();
        assert_eq!(json["targetId"], "b");
        assert_eq!(json["orphanTitle"], "A");
    }
}
