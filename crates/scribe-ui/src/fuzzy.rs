//! Fuzzy ranking over string lists (FE fuse.js + structural scorer; Rust Skim + normalize).

use fuzzy_matcher::skim::SkimMatcherV2;
use fuzzy_matcher::FuzzyMatcher;
use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;

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

/// Casefold + strip diacritics + punct→space (aligned with scribe-core / python-ui / FE).
pub fn normalize_for_fuzzy(input: &str) -> String {
    let lowered = input.trim().to_lowercase();
    let nfkd: String = lowered
        .nfd()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .collect();
    let cleaned: String = nfkd
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect();
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn structural_token_score(haystack: &str, needle: &str) -> i64 {
    if haystack.is_empty() || needle.is_empty() {
        return 0;
    }
    if haystack == needle {
        return 100;
    }
    if haystack.starts_with(needle) {
        let extra = (haystack.len() - needle.len()).min(20) as i64;
        return 95 - extra / 4;
    }
    if let Some(idx) = haystack.find(needle) {
        let boundary = idx == 0
            || !haystack
                .get(..idx)
                .and_then(|prefix| prefix.chars().last())
                .map(|c| c.is_alphanumeric())
                .unwrap_or(false);
        let base = if boundary { 90 } else { 75 };
        return base - (idx.min(30) as i64) / 2;
    }
    0
}

fn structural_field_score(haystack_raw: &str, query_norm: &str) -> i64 {
    let haystack = normalize_for_fuzzy(haystack_raw);
    if haystack.is_empty() || query_norm.is_empty() {
        return 0;
    }
    let tokens: Vec<&str> = query_norm.split_whitespace().collect();
    if tokens.is_empty() {
        return 0;
    }
    let mut total = 0i64;
    for token in &tokens {
        let score = structural_token_score(&haystack, token);
        if score <= 0 {
            return 0;
        }
        total += score;
    }
    total / tokens.len() as i64
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

    let q_norm = normalize_for_fuzzy(q);
    let matcher = SkimMatcherV2::default().ignore_case();
    let mut hits: Vec<FuzzyRankHit> = items
        .iter()
        .filter_map(|item| {
            let primary_struct = structural_field_score(&item.primary, &q_norm);
            let secondary_struct = if item.secondary.is_empty() {
                0
            } else {
                structural_field_score(&item.secondary, &q_norm) * 65 / 100
            };
            let structural = primary_struct.max(secondary_struct);

            let primary_fold = normalize_for_fuzzy(&item.primary);
            let secondary_fold = normalize_for_fuzzy(&item.secondary);
            let primary_skim = matcher.fuzzy_match(&primary_fold, &q_norm).unwrap_or(0);
            let secondary_skim = if secondary_fold.is_empty() {
                0
            } else {
                matcher.fuzzy_match(&secondary_fold, &q_norm).unwrap_or(0)
            };
            // Skim scores are large integers; scale down and blend with structural 0..100.
            let skim = primary_skim.saturating_mul(3).saturating_add(secondary_skim);
            let skim_scaled = (skim / 8).clamp(0, 100);
            let score = if structural >= 55 {
                structural.saturating_mul(10).saturating_add(skim_scaled)
            } else if skim_scaled > 0 {
                skim_scaled
            } else {
                0
            };
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

    #[test]
    fn folds_slovak_diacritics() {
        assert_eq!(normalize_for_fuzzy("Správa"), "sprava");
        let items = vec![
            FuzzyRankItem {
                id: "1".into(),
                primary: "Správa používateľov".into(),
                secondary: String::new(),
            },
            FuzzyRankItem {
                id: "2".into(),
                primary: "Grocery list".into(),
                secondary: String::new(),
            },
        ];
        let hits = fuzzy_rank_strings(&items, "sprava", None);
        assert_eq!(hits[0].id, "1");
    }

    #[test]
    fn multi_token_and() {
        let items = vec![
            FuzzyRankItem {
                id: "1".into(),
                primary: "Weekly project roadmap".into(),
                secondary: String::new(),
            },
            FuzzyRankItem {
                id: "2".into(),
                primary: "Weekly digest".into(),
                secondary: String::new(),
            },
        ];
        let hits = fuzzy_rank_strings(&items, "week road", None);
        assert_eq!(hits[0].id, "1");
    }
}
