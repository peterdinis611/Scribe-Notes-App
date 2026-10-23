//! Fuzzy string similarity for title / wiki label matching.

use std::collections::{BTreeSet, HashMap};

use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone, PartialEq)]
pub struct FuzzyMatch {
    pub index: usize,
    pub choice: String,
    pub score: f64,
}

/// Lowercase, strip diacritics, replace punctuation with spaces and collapse whitespace.
pub fn normalize(input: &str) -> String {
    let lowered = input.trim().to_lowercase();
    let folded: String = lowered
        .nfd()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .collect();

    let cleaned: String = folded
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect();

    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Plain 0..1 similarity on already-normalized strings.
fn base_ratio(left: &str, right: &str) -> f64 {
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    if left == right {
        return 1.0;
    }

    #[cfg(feature = "fuzzy")]
    {
        return rapidfuzz::fuzz::ratio(left.chars(), right.chars()).clamp(0.0, 1.0);
    }

    #[cfg(not(feature = "fuzzy"))]
    {
        dice_bigram(left, right)
    }
}

/// Word order independent: sorts tokens before comparing.
fn token_sort_ratio(left: &str, right: &str) -> f64 {
    let sort = |s: &str| {
        let mut t: Vec<&str> = s.split_whitespace().collect();
        t.sort_unstable();
        t.join(" ")
    };
    base_ratio(&sort(left), &sort(right))
}

/// Handles subset matches: "rust" vs "rust programming language".
fn token_set_ratio(left: &str, right: &str) -> f64 {
    let a: BTreeSet<&str> = left.split_whitespace().collect();
    let b: BTreeSet<&str> = right.split_whitespace().collect();
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }

    let join = |parts: Vec<&str>| parts.join(" ");
    let inter = join(a.intersection(&b).copied().collect());
    let diff_a = join(a.difference(&b).copied().collect());
    let diff_b = join(b.difference(&a).copied().collect());

    let t1 = format!("{inter} {diff_a}").trim().to_string();
    let t2 = format!("{inter} {diff_b}").trim().to_string();

    base_ratio(&inter, &t1)
        .max(base_ratio(&inter, &t2))
        .max(base_ratio(&t1, &t2))
}

/// Small bonus when one string starts with / contains the other.
fn containment_bonus(left: &str, right: &str) -> f64 {
    let (short, long) = if left.len() <= right.len() { (left, right) } else { (right, left) };
    if short.chars().count() < 2 {
        return 0.0;
    }
    if long.starts_with(short) {
        0.10
    } else if long.contains(short) {
        0.05
    } else {
        0.0
    }
}

/// Score between two already-normalized strings.
fn score_normalized(left: &str, right: &str) -> f64 {
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    if left == right {
        return 1.0;
    }
    let best = base_ratio(left, right)
        .max(token_sort_ratio(left, right))
        .max(token_set_ratio(left, right) * 0.95); // set-ratio is generous, damp it
    (best + containment_bonus(left, right)).clamp(0.0, 1.0)
}

/// 0..1 similarity between two strings (case/diacritics/punctuation-insensitive).
pub fn fuzzy_ratio(a: &str, b: &str) -> f64 {
    score_normalized(&normalize(a), &normalize(b))
}

/// Top fuzzy matches, best first. Ties are broken by original order.
pub fn fuzzy_match(query: &str, choices: &[String], limit: usize, score_cutoff: f64) -> Vec<FuzzyMatch> {
    let q = normalize(query);
    if q.is_empty() || choices.is_empty() {
        return Vec::new();
    }
    let limit = limit.clamp(1, 40);
    let cutoff = score_cutoff.clamp(0.0, 1.0);

    let mut scored: Vec<FuzzyMatch> = choices
        .iter()
        .enumerate()
        .filter_map(|(index, choice)| {
            let score = score_normalized(&q, &normalize(choice));
            (score >= cutoff).then(|| FuzzyMatch { index, choice: choice.clone(), score })
        })
        .collect();

    scored.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.index.cmp(&b.index)));
    scored.truncate(limit);
    scored
}

/// Backwards-compatible wrapper.
pub fn fuzzy_extract(query: &str, choices: &[String], limit: usize, score_cutoff: f64) -> Vec<(String, f64)> {
    fuzzy_match(query, choices, limit, score_cutoff)
        .into_iter()
        .map(|m| (m.choice, m.score))
        .collect()
}

#[cfg(not(feature = "fuzzy"))]
fn dice_bigram(left: &str, right: &str) -> f64 {
    fn bigrams(value: &str) -> (HashMap<(char, char), usize>, usize) {
        let chars: Vec<char> = value.chars().collect();
        let mut map = HashMap::new();
        for w in chars.windows(2) {
            *map.entry((w[0], w[1])).or_insert(0) += 1;
        }
        (map, chars.len().saturating_sub(1))
    }

    let (a, total_a) = bigrams(left);
    let (b, total_b) = bigrams(right);
    if total_a == 0 || total_b == 0 {
        // single-char strings: equal was already handled upstream
        return 0.0;
    }
    let inter: usize = a
        .iter()
        .map(|(k, &ca)| ca.min(*b.get(k).unwrap_or(&0)))
        .sum();
    (2.0 * inter as f64) / (total_a + total_b) as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn word_order_is_ignored() {
        assert!(fuzzy_ratio("Rust programming", "programming rust") > 0.95);
    }

    #[test]
    fn prefix_ranks_higher() {
        let choices = vec!["Zoznam rastlín".to_string(), "Rust (programming language)".to_string()];
        let res = fuzzy_match("rust", &choices, 5, 0.3);
        assert_eq!(res[0].index, 1);
    }

    #[test]
    fn diacritics_are_ignored() {
        assert_eq!(fuzzy_ratio("Kôň", "kon"), 1.0);
        assert!(fuzzy_ratio("Správa", "sprava") > 0.99);
    }

    #[test]
    fn empty_is_zero() {
        assert_eq!(fuzzy_ratio("", "abc"), 0.0);
    }
}