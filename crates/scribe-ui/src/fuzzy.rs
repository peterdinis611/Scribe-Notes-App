//! Fuzzy ranking over string lists (FE uses fuse.js; Rust uses SkimMatcherV2).

use fuzzy_matcher::skim::SkimMatcherV2;
use fuzzy_matcher::FuzzyMatcher;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FuzzyRankItem {
    pub id: String,
    pub primary: String,
    #[serde(default)]
    pub secondary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FuzzyRankHit {
    pub id: String,
    pub score: i64,
}

/// Rank items by fuzzy match against `query`. Empty query returns all ids in order.
pub fn fuzzy_rank_strings(
    items: &[FuzzyRankItem],
    query: &str,
    limit: Option<usize>,
) -> Vec<FuzzyRankHit> {
    let q = query.trim();
    if q.is_empty() {
        let all: Vec<FuzzyRankHit> = items
            .iter()
            .map(|item| FuzzyRankHit {
                id: item.id.clone(),
                score: 0,
            })
            .collect();
        return match limit {
            Some(n) => all.into_iter().take(n).collect(),
            None => all,
        };
    }

    let matcher = SkimMatcherV2::default();
    let mut hits: Vec<FuzzyRankHit> = items
        .iter()
        .filter_map(|item| {
            let primary = matcher.fuzzy_match(&item.primary, q).unwrap_or(0);
            let secondary = if item.secondary.is_empty() {
                0
            } else {
                matcher.fuzzy_match(&item.secondary, q).unwrap_or(0)
            };
            // Weight primary higher (similar to fuse 0.75 / 0.25).
            let score = primary.saturating_mul(3).saturating_add(secondary);
            if score <= 0 {
                return None;
            }
            Some(FuzzyRankHit {
                id: item.id.clone(),
                score,
            })
        })
        .collect();
    hits.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.id.cmp(&b.id)));
    match limit {
        Some(n) => hits.into_iter().take(n).collect(),
        None => hits,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranks_primary_match() {
        let items = vec![
            FuzzyRankItem {
                id: "1".into(),
                primary: "Meeting notes".into(),
                secondary: "work".into(),
            },
            FuzzyRankItem {
                id: "2".into(),
                primary: "Grocery list".into(),
                secondary: String::new(),
            },
        ];
        let hits = fuzzy_rank_strings(&items, "meet", None);
        assert_eq!(hits[0].id, "1");
    }
}
