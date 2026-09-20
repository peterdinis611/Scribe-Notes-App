//! Fuzzy string similarity for title / wiki label matching.

/// 0..1 similarity between two strings (case-insensitive).
pub fn fuzzy_ratio(a: &str, b: &str) -> f64 {
    let left = a.trim().to_lowercase();
    let right = b.trim().to_lowercase();
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    if left == right {
        return 1.0;
    }

    #[cfg(feature = "fuzzy")]
    {
        let score = rapidfuzz::fuzz::ratio(left.chars(), right.chars());
        return score.clamp(0.0, 1.0);
    }

    #[cfg(not(feature = "fuzzy"))]
    {
        dice_bigram(&left, &right)
    }
}

/// Top fuzzy matches as `(choice, 0..1 score)`.
pub fn fuzzy_extract(query: &str, choices: &[String], limit: usize, score_cutoff: f64) -> Vec<(String, f64)> {
    if query.trim().is_empty() || choices.is_empty() {
        return Vec::new();
    }
    let limit = limit.clamp(1, 40);
    let cutoff = score_cutoff.clamp(0.0, 1.0);

    let mut scored: Vec<(String, f64)> = choices
        .iter()
        .map(|choice| (choice.clone(), fuzzy_ratio(query, choice)))
        .filter(|(_, score)| *score >= cutoff)
        .collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);
    scored
}

#[cfg(not(feature = "fuzzy"))]
fn dice_bigram(left: &str, right: &str) -> f64 {
    fn bigrams(value: &str) -> std::collections::HashSet<String> {
        let chars: Vec<char> = value.chars().collect();
        if chars.len() < 2 {
            return std::collections::HashSet::from([value.to_string()]);
        }
        chars
            .windows(2)
            .map(|w| format!("{}{}", w[0], w[1]))
            .collect()
    }
    let a = bigrams(left);
    let b = bigrams(right);
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let inter = a.intersection(&b).count() as f64;
    (2.0 * inter) / (a.len() as f64 + b.len() as f64)
}
