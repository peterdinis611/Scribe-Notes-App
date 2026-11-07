//! Offline citation pack: which passages best support a claim.

use crate::types::NlpCitation;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CitationDocInput {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CitationPack {
    pub claim: String,
    pub citations: Vec<NlpCitation>,
    pub bullets: Vec<String>,
    pub count: i64,
    pub source: String,
}

/// Build a citation pack from a claim + candidate documents (Rust fallback).
pub fn citation_pack(claim: &str, documents: &[CitationDocInput], limit: usize) -> CitationPack {
    let query = normalize(claim);
    let limit = limit.clamp(1, 20);
    if query.is_empty() {
        return CitationPack {
            claim: String::new(),
            citations: Vec::new(),
            bullets: Vec::new(),
            count: 0,
            source: "rust".into(),
        };
    }
    let query_stems: Vec<String> = significant_stems(&query);
    let mut scored: Vec<(f64, NlpCitation)> = Vec::new();

    for doc in documents {
        let text = if !doc.text.trim().is_empty() {
            doc.text.as_str()
        } else {
            doc.snippet.as_str()
        };
        if text.trim().is_empty() {
            continue;
        }
        let mut best_score = 0.0f64;
        let mut best_sentence = String::new();
        for sentence in split_sentences(text) {
            let cleaned = normalize(&sentence);
            if cleaned.chars().count() < 24 {
                continue;
            }
            let stems = significant_stems(&cleaned);
            let overlap = query_stems
                .iter()
                .filter(|stem| stems.iter().any(|other| other == *stem))
                .count();
            if overlap == 0 {
                continue;
            }
            let mut score = overlap as f64 / query_stems.len().max(1) as f64;
            score += (overlap as f64 * 0.05).min(0.25);
            let prefix: String = query.chars().take(40).collect();
            if !prefix.is_empty() && cleaned.to_lowercase().contains(&prefix.to_lowercase()) {
                score += 0.35;
            }
            if score > best_score {
                best_score = score;
                best_sentence = cleaned;
            }
        }
        if best_score >= 0.2 && !best_sentence.is_empty() {
            let snippet: String = best_sentence.chars().take(320).collect();
            scored.push((
                best_score,
                NlpCitation {
                    document_id: doc.id.clone(),
                    title: if doc.title.trim().is_empty() {
                        "Untitled".into()
                    } else {
                        doc.title.clone()
                    },
                    snippet,
                    score: Some((best_score * 1000.0).round() / 1000.0),
                    chunk_index: None,
                },
            ));
        }
    }

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);
    let citations: Vec<NlpCitation> = scored.into_iter().map(|(_, cite)| cite).collect();
    let bullets = citations
        .iter()
        .map(|item| {
            let snip: String = item.snippet.chars().take(160).collect();
            format!("“{snip}” — {}", item.title)
        })
        .collect();
    let count = citations.len() as i64;
    CitationPack {
        claim: query,
        citations,
        bullets,
        count,
        source: "rust".into(),
    }
}

fn normalize(input: &str) -> String {
    input
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn split_sentences(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut buf = String::new();
    for ch in text.chars() {
        buf.push(ch);
        if matches!(ch, '.' | '!' | '?' | '…') {
            let trimmed = buf.trim().to_string();
            if !trimmed.is_empty() {
                out.push(trimmed);
            }
            buf.clear();
        }
    }
    let trimmed = buf.trim().to_string();
    if !trimmed.is_empty() {
        out.push(trimmed);
    }
    out
}

fn significant_stems(text: &str) -> Vec<String> {
    text.split(|ch: char| !ch.is_alphanumeric())
        .map(|token| token.to_lowercase())
        .filter(|token| token.chars().count() >= 3)
        .map(|token| {
            // Tiny stem: strip common English/Slovak endings.
            let mut stem = token;
            for ending in ["ing", "ed", "es", "ly", "ov", "om", "ami", "ách"] {
                if stem.len() > ending.len() + 3 && stem.ends_with(ending) {
                    stem = stem[..stem.len() - ending.len()].to_string();
                    break;
                }
            }
            stem
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packs_supporting_sentence() {
        let docs = [CitationDocInput {
            id: "d1".into(),
            title: "Plan".into(),
            text: "We discussed many topics. The launch deadline is Friday night. Snacks later.".into(),
            snippet: String::new(),
        }];
        let pack = citation_pack("What is the deadline Friday?", &docs, 4);
        assert_eq!(pack.count, 1);
        assert!(pack.citations[0].snippet.to_lowercase().contains("friday"));
        assert!(!pack.bullets.is_empty());
    }
}
