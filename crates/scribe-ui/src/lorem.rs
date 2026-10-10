//! Local lorem-ipsum generator (engine routing stays FE).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LoremUnit {
    Paragraphs,
    Sentences,
    Words,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoremOptions {
    pub unit: LoremUnit,
    pub count: u32,
    pub start_with_lorem: bool,
}

impl Default for LoremOptions {
    fn default() -> Self {
        Self {
            unit: LoremUnit::Paragraphs,
            count: 3,
            start_with_lorem: true,
        }
    }
}

const LOREM_WORDS: &[&str] = &[
    "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit", "sed",
    "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore", "magna", "aliqua",
    "enim", "ad", "minim", "veniam", "quis", "nostrud", "exercitation", "ullamco", "laboris",
    "nisi", "aliquip", "ex", "ea", "commodo", "consequat", "duis", "aute", "irure", "in",
    "reprehenderit", "voluptate", "velit", "esse", "cillum", "fugiat", "nulla", "pariatur",
    "excepteur", "sint", "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui",
    "officia", "deserunt", "mollit", "anim", "id", "est", "laborum",
];

const CLASSIC_LEAD: &[&str] = &[
    "Lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
];

fn capitalize(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

fn next_word(index: usize, start_with_lorem: bool) -> &'static str {
    if start_with_lorem && index < CLASSIC_LEAD.len() {
        return CLASSIC_LEAD[index];
    }
    let offset = if start_with_lorem { CLASSIC_LEAD.len() } else { 0 };
    LOREM_WORDS[(index - offset) % LOREM_WORDS.len()]
}

fn build_words(total: usize, start_with_lorem: bool) -> Vec<String> {
    (0..total)
        .map(|i| {
            let word = next_word(i, start_with_lorem);
            if i == 0 {
                capitalize(word)
            } else {
                word.to_string()
            }
        })
        .collect()
}

fn words_to_sentences(words: &[String], sentence_count: usize) -> Vec<String> {
    if words.is_empty() || sentence_count < 1 {
        return vec![];
    }
    let mut sentences = Vec::new();
    let base = (words.len() / sentence_count).max(1);
    let mut cursor = 0usize;
    for s in 0..sentence_count {
        let remaining_sentences = sentence_count - s;
        let remaining_words = words.len() - cursor;
        let take = if s == sentence_count - 1 {
            remaining_words
        } else {
            (base + (s % 3))
                .max(3)
                .min(remaining_words.saturating_sub(remaining_sentences) + 1)
        };
        if take == 0 {
            break;
        }
        let mut chunk: Vec<String> = words[cursor..cursor + take].to_vec();
        cursor += take;
        if let Some(first) = chunk.first_mut() {
            *first = capitalize(first);
        }
        sentences.push(format!("{}.", chunk.join(" ")));
    }
    sentences
}

fn sentences_to_paragraphs(sentences: &[String], paragraph_count: usize) -> Vec<String> {
    if sentences.is_empty() || paragraph_count < 1 {
        return vec![];
    }
    let mut paragraphs = Vec::new();
    let base = (sentences.len() / paragraph_count).max(1);
    let mut cursor = 0usize;
    for p in 0..paragraph_count {
        let remaining_paragraphs = paragraph_count - p;
        let remaining_sentences = sentences.len() - cursor;
        let take = if p == paragraph_count - 1 {
            remaining_sentences
        } else {
            (base + (p % 2))
                .max(1)
                .min(remaining_sentences.saturating_sub(remaining_paragraphs) + 1)
        };
        if take == 0 {
            break;
        }
        paragraphs.push(sentences[cursor..cursor + take].join(" "));
        cursor += take;
    }
    paragraphs
}

pub fn normalize_lorem_options(unit: LoremUnit, count: u32, start_with_lorem: bool) -> LoremOptions {
    LoremOptions {
        unit,
        count: count.max(1).min(200),
        start_with_lorem,
    }
}

pub fn generate_lorem_ipsum(options: &LoremOptions) -> String {
    let opts = normalize_lorem_options(options.unit, options.count, options.start_with_lorem);
    let count = opts.count as usize;

    match opts.unit {
        LoremUnit::Words => build_words(count, opts.start_with_lorem).join(" "),
        LoremUnit::Sentences => {
            let approx_words = (count * 8).max(count);
            let words = build_words(approx_words, opts.start_with_lorem);
            words_to_sentences(&words, count).join(" ")
        }
        LoremUnit::Paragraphs => {
            let sentence_count = (count * 4).max(count);
            let approx_words = (sentence_count * 8).max(sentence_count);
            let words = build_words(approx_words, opts.start_with_lorem);
            let sentences = words_to_sentences(&words, sentence_count);
            sentences_to_paragraphs(&sentences, count).join("\n\n")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_words() {
        let text = generate_lorem_ipsum(&LoremOptions {
            unit: LoremUnit::Words,
            count: 5,
            start_with_lorem: true,
        });
        assert!(text.starts_with("Lorem"));
        assert_eq!(text.split_whitespace().count(), 5);
    }
}
