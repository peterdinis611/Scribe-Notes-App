//! Local n-gram continuation suggestions (Rust fallback when Python NLP is off).

use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::OnceLock;

const MAX_PREFIX_CHARS: usize = 4_000;
const MAX_CORPUS_DOCS: usize = 80;
const MAX_CORPUS_CHARS: usize = 120_000;
const MAX_SUGGESTIONS: usize = 5;
const MAX_TOKENS: usize = 32;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinuationSuggestion {
    pub text: String,
    pub score: f64,
    pub model: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinuationResult {
    pub suggestions: Vec<ContinuationSuggestion>,
    pub prefix_tail: String,
    pub source: String,
    pub corpus_docs: usize,
    pub model: String,
}

fn token_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[A-Za-zÀ-ž0-9][A-Za-zÀ-ž0-9'\-]{0,48}").expect("token regex"))
}

pub fn tokenize(text: &str) -> Vec<String> {
    token_re()
        .find_iter(text)
        .map(|m| m.as_str().to_string())
        .collect()
}

pub fn suggest_continuation(
    prefix: &str,
    corpus: &[String],
    max_suggestions: usize,
    max_tokens: usize,
) -> ContinuationResult {
    let prefix = truncate_end(prefix, MAX_PREFIX_CHARS);
    let max_suggestions = max_suggestions.clamp(1, MAX_SUGGESTIONS);
    let max_tokens = max_tokens.clamp(1, MAX_TOKENS);

    let mut docs = prepare_corpus(corpus);
    let corpus_docs = docs.len();
    if !prefix.trim().is_empty() {
        docs.push(prefix.to_string());
    }

    let token_docs: Vec<Vec<String>> = docs
        .iter()
        .map(|doc| tokenize(doc))
        .filter(|tokens| !tokens.is_empty())
        .collect();

    if token_docs.is_empty() {
        return ContinuationResult {
            suggestions: Vec::new(),
            prefix_tail: String::new(),
            source: "rust".into(),
            corpus_docs,
            model: "empty".into(),
        };
    }

    let mut trigrams: HashMap<(String, String), HashMap<String, u32>> = HashMap::new();
    let mut bigrams: HashMap<String, HashMap<String, u32>> = HashMap::new();
    let mut unigrams: HashMap<String, u32> = HashMap::new();

    for tokens in &token_docs {
        for token in tokens {
            *unigrams.entry(token.to_lowercase()).or_insert(0) += 1;
        }
        for window in tokens.windows(2) {
            *bigrams
                .entry(window[0].to_lowercase())
                .or_default()
                .entry(window[1].clone())
                .or_insert(0) += 1;
        }
        for window in tokens.windows(3) {
            let key = (window[0].to_lowercase(), window[1].to_lowercase());
            *trigrams
                .entry(key)
                .or_default()
                .entry(window[2].clone())
                .or_insert(0) += 1;
        }
    }

    let seed = tokenize(prefix);
    let mut tail: Vec<String> = seed
        .iter()
        .rev()
        .take(2)
        .map(|t| t.to_lowercase())
        .collect();
    tail.reverse();
    let prefix_tail = seed
        .iter()
        .rev()
        .take(4)
        .cloned()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join(" ");

    let mut suggestions = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for mode in ["trigram", "bigram", "unigram"] {
        for (text, score, model) in generate_candidates(
            mode,
            &tail,
            &trigrams,
            &bigrams,
            &unigrams,
            max_tokens,
            max_suggestions * 3,
        ) {
            let key = text.to_lowercase();
            if text.is_empty() || !seen.insert(key) {
                continue;
            }
            suggestions.push(ContinuationSuggestion {
                text,
                score: (score * 10_000.0).round() / 10_000.0,
                model: model.to_string(),
            });
            if suggestions.len() >= max_suggestions {
                break;
            }
        }
        if suggestions.len() >= max_suggestions {
            break;
        }
    }

    let model = suggestions
        .first()
        .map(|s| s.model.clone())
        .unwrap_or_else(|| "empty".into());

    ContinuationResult {
        suggestions,
        prefix_tail,
        source: "rust".into(),
        corpus_docs,
        model,
    }
}

fn prepare_corpus(corpus: &[String]) -> Vec<String> {
    let mut docs = Vec::new();
    let mut total = 0usize;
    for raw in corpus.iter().take(MAX_CORPUS_DOCS) {
        let text = raw.trim();
        if text.chars().count() < 24 {
            continue;
        }
        let remaining = MAX_CORPUS_CHARS.saturating_sub(total);
        if remaining == 0 {
            break;
        }
        let chunk: String = text.chars().take(remaining).collect();
        total += chunk.chars().count();
        docs.push(chunk);
    }
    docs
}

fn truncate_end(text: &str, max_chars: usize) -> &str {
    if text.chars().count() <= max_chars {
        return text;
    }
    let skip = text.chars().count() - max_chars;
    let mut idx = 0;
    for (i, _) in text.char_indices().skip(skip) {
        idx = i;
        break;
    }
    &text[idx..]
}

fn generate_candidates(
    mode: &str,
    tail: &[String],
    trigrams: &HashMap<(String, String), HashMap<String, u32>>,
    bigrams: &HashMap<String, HashMap<String, u32>>,
    unigrams: &HashMap<String, u32>,
    max_tokens: usize,
    limit: usize,
) -> Vec<(String, f64, &'static str)> {
    let starters = starter_options(mode, tail, trigrams, bigrams, unigrams);
    let mut out = Vec::new();
    for (first, first_score) in starters.into_iter().take(limit.max(6)) {
        let mut words = vec![first.clone()];
        let mut score = first_score;
        let mut local_tail = tail.to_vec();
        local_tail.push(first.to_lowercase());
        for _ in 1..max_tokens {
            let Some((token, step)) = next_token(&local_tail, trigrams, bigrams, unigrams) else {
                break;
            };
            words.push(token.clone());
            score += step;
            local_tail.push(token.to_lowercase());
            if local_tail.len() > 2 {
                local_tail = local_tail[local_tail.len() - 2..].to_vec();
            }
        }
        let text = words.join(" ");
        if !text.is_empty() {
            out.push((text, score / words.len() as f64, mode_static(mode)));
        }
    }
    out.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    out.truncate(limit);
    out
}


fn mode_static(mode: &str) -> &'static str {
    match mode {
        "trigram" => "trigram",
        "bigram" => "bigram",
        _ => "unigram",
    }
}

fn starter_options(
    mode: &str,
    tail: &[String],
    trigrams: &HashMap<(String, String), HashMap<String, u32>>,
    bigrams: &HashMap<String, HashMap<String, u32>>,
    unigrams: &HashMap<String, u32>,
) -> Vec<(String, f64)> {
    if mode == "trigram" && tail.len() >= 2 {
        if let Some(map) = trigrams.get(&(tail[tail.len() - 2].clone(), tail[tail.len() - 1].clone()))
        {
            let ranked = top_map(map);
            if !ranked.is_empty() {
                return ranked;
            }
        }
    }
    if (mode == "trigram" || mode == "bigram") && !tail.is_empty() {
        if let Some(map) = bigrams.get(tail.last().unwrap()) {
            let ranked = top_map(map);
            if !ranked.is_empty() {
                return ranked;
            }
        }
    }
    top_map(unigrams)
}

fn next_token(
    tail: &[String],
    trigrams: &HashMap<(String, String), HashMap<String, u32>>,
    bigrams: &HashMap<String, HashMap<String, u32>>,
    unigrams: &HashMap<String, u32>,
) -> Option<(String, f64)> {
    if tail.len() >= 2 {
        if let Some(map) = trigrams.get(&(tail[tail.len() - 2].clone(), tail[tail.len() - 1].clone()))
        {
            if let Some((token, score)) = top_map(map).into_iter().next() {
                return Some((token, score));
            }
        }
    }
    if let Some(last) = tail.last() {
        if let Some(map) = bigrams.get(last) {
            if let Some((token, score)) = top_map(map).into_iter().next() {
                return Some((token, score));
            }
        }
    }
    top_map(unigrams).into_iter().next()
}

fn top_map(map: &HashMap<String, u32>) -> Vec<(String, f64)> {
    let mut items: Vec<(String, f64)> = map
        .iter()
        .map(|(k, v)| (k.clone(), f64::from(*v)))
        .collect();
    items.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    items.truncate(12);
    items
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suggests_from_corpus() {
        let corpus = vec![
            "The project deadline is next Monday after review.".into(),
            "The project deadline is next Friday for shipping.".into(),
            "We discussed the project deadline in standup.".into(),
        ];
        let result = suggest_continuation("The project deadline", &corpus, 3, 4);
        assert_eq!(result.source, "rust");
        assert!(!result.suggestions.is_empty());
        let top = result.suggestions[0].text.to_lowercase();
        assert!(top.contains("is") || top.contains("next") || top.contains("in"));
    }

    #[test]
    fn empty_corpus_with_short_prefix() {
        let result = suggest_continuation("alone", &[], 2, 4);
        assert_eq!(result.source, "rust");
    }
}
