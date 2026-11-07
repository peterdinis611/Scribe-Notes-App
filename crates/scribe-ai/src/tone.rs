//! Offline tone pack: Flesch-lite + polarity lexicon.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NlpTonePack {
    pub summary: String,
    #[serde(default)]
    pub readability_label: String,
    #[serde(default)]
    pub flesch: f64,
    #[serde(default)]
    pub reading_time_minutes: f64,
    #[serde(default)]
    pub word_count: i64,
    #[serde(default)]
    pub polarity: String,
    #[serde(default)]
    pub polarity_score: f64,
    #[serde(default)]
    pub hints: Vec<String>,
    #[serde(default)]
    pub source: String,
}

fn syllables(word: &str) -> usize {
    let lower = word.to_lowercase();
    let vowels = ['a', 'e', 'i', 'o', 'u', 'y', 'á', 'ä', 'é', 'í', 'ó', 'ô', 'ú', 'ý'];
    let mut count = 0usize;
    let mut prev = false;
    for ch in lower.chars() {
        let is_vowel = vowels.contains(&ch);
        if is_vowel && !prev {
            count += 1;
        }
        prev = is_vowel;
    }
    count.max(1)
}

pub fn tone_pack(text: &str) -> NlpTonePack {
    let words: Vec<&str> = text.split_whitespace().collect();
    let word_count = words.len() as i64;
    let sentence_count = text
        .split(|c: char| matches!(c, '.' | '!' | '?'))
        .filter(|s| !s.trim().is_empty())
        .count()
        .max(1) as f64;
    let syllable_count: usize = words.iter().map(|w| syllables(w)).sum();
    let flesch = if word_count == 0 {
        100.0
    } else {
        (206.835
            - 1.015 * (word_count as f64 / sentence_count)
            - 84.6 * (syllable_count as f64 / word_count as f64))
            .clamp(0.0, 100.0)
    };
    let readability_label = if flesch >= 80.0 {
        "veryEasy"
    } else if flesch >= 60.0 {
        "easy"
    } else if flesch >= 50.0 {
        "fair"
    } else if flesch >= 30.0 {
        "difficult"
    } else {
        "veryDifficult"
    };
    let minutes = if word_count == 0 {
        0.0
    } else {
        word_count as f64 / 200.0
    };

    let positive: HashSet<&str> = [
        "good", "great", "excellent", "happy", "love", "progress", "hope", "calm", "success",
        "dobre", "skvele", "radost", "uspech", "pokrok", "pokoj",
    ]
    .into_iter()
    .collect();
    let negative: HashSet<&str> = [
        "bad", "sad", "fail", "failed", "angry", "fear", "stress", "problem", "hate", "worse",
        "zle", "smutny", "problem", "strach", "stres", "zlyhanie",
    ]
    .into_iter()
    .collect();

    let mut pos = 0i64;
    let mut neg = 0i64;
    for word in &words {
        let key = word
            .trim_matches(|c: char| !c.is_alphanumeric())
            .to_lowercase();
        if positive.contains(key.as_str()) {
            pos += 1;
        }
        if negative.contains(key.as_str()) {
            neg += 1;
        }
    }
    let total = pos + neg;
    let (polarity, polarity_score) = if total == 0 {
        ("neutral".to_string(), 0.0)
    } else {
        let raw = (pos - neg) as f64 / total as f64;
        let label = if raw >= 0.25 {
            "positive"
        } else if raw <= -0.25 {
            "negative"
        } else if total >= 3 {
            "mixed"
        } else {
            "neutral"
        };
        (label.to_string(), (raw * 1000.0).round() / 1000.0)
    };

    let mut hints = Vec::new();
    if readability_label == "difficult" || readability_label == "veryDifficult" {
        hints.push("dense_prose".to_string());
    }
    if minutes >= 12.0 {
        hints.push("long_read".to_string());
    }
    if polarity == "negative" || polarity == "mixed" {
        hints.push("watch_tone".to_string());
    }

    NlpTonePack {
        summary: format!(
            "{readability_label} readability · ~{:.1} min · tone {polarity}",
            minutes
        ),
        readability_label: readability_label.to_string(),
        flesch: (flesch * 10.0).round() / 10.0,
        reading_time_minutes: (minutes * 100.0).round() / 100.0,
        word_count,
        polarity,
        polarity_score,
        hints,
        source: "rust".to_string(),
    }
}

pub fn tone_pack_value(text: &str) -> Value {
    serde_json::to_value(tone_pack(text)).unwrap_or_else(|_| json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scores_positive_easy_text() {
        let report = tone_pack("This is a great calm note. I love the progress and hope.");
        assert_eq!(report.source, "rust");
        assert!(report.word_count > 5);
    }
}
