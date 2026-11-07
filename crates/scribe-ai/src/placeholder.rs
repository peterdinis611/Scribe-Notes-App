//! Placeholder / lorem-style filler text for the editor (offline fallback).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlaceholderUnit {
    Paragraphs,
    Sentences,
    Words,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlaceholderLanguage {
    La,
    En,
    Sk,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaceholderResult {
    pub text: String,
    pub unit: PlaceholderUnit,
    pub count: u32,
    pub language: PlaceholderLanguage,
    pub source: String,
    pub start_with_classic: bool,
}

const CLASSIC_LEAD: &[&str] = &[
    "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
];

const WORDS_LA: &[&str] = &[
    "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit", "sed", "do",
    "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore", "magna", "aliqua", "enim",
    "ad", "minim", "veniam", "quis", "nostrud", "exercitation", "ullamco", "laboris", "nisi",
    "aliquip", "ex", "ea", "commodo", "consequat", "duis", "aute", "irure", "in", "reprehenderit",
    "voluptate", "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint",
    "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia", "deserunt",
    "mollit", "anim", "id", "est", "laborum",
];

const WORDS_EN: &[&str] = &[
    "the", "quick", "brown", "fox", "jumps", "over", "lazy", "dog", "notes", "draft", "outline",
    "section", "heading", "paragraph", "example", "sample", "content", "placeholder", "document",
    "editor", "library", "folder", "task", "meeting", "agenda", "summary", "detail", "context",
    "decision", "action", "follow", "up", "review", "update", "progress", "idea", "thought",
    "remark", "reference", "source", "figure", "table", "list", "item", "point", "topic", "theme",
    "story", "chapter", "page", "line", "word", "sentence", "space", "layout", "design",
    "structure", "flow", "clarity", "focus", "drafting", "rewrite", "polish", "finish",
];

const WORDS_SK: &[&str] = &[
    "rychly", "hnedy", "lisak", "preskakuje", "cez", "leneho", "psa", "poznamky", "koncept",
    "osnova", "sekcia", "nadpis", "odsek", "priklad", "ukazka", "obsah", "zastupny", "text",
    "dokument", "editor", "kniznica", "priecinok", "uloha", "stretnutie", "agenda", "zhrnutie",
    "detail", "kontext", "rozhodnutie", "akcia", "nasledny", "krok", "kontrola", "aktualizacia",
    "pokrok", "napad", "myslienka", "poznamka", "odkaz", "zdroj", "obrazok", "tabulka", "zoznam",
    "polozka", "bod", "tema", "pribeh", "kapitola", "strana", "riadok", "slovo", "veta", "medzera",
    "rozlozenie", "dizajn", "struktura", "tok", "jasnost", "sustredenie", "pisanie", "prepis",
    "uprava", "dokoncenie",
];

/// Tiny LCG so we avoid pulling `rand` into scribe-core.
struct Rng64 {
    state: u64,
}

impl Rng64 {
    fn new(seed: u64) -> Self {
        Self {
            state: if seed == 0 { 0x9E37_79B9_7F4A_7C15 } else { seed },
        }
    }

    fn from_entropy() -> Self {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0xA5A5_A5A5_A5A5_A5A5);
        Self::new(nanos ^ (std::process::id() as u64).wrapping_mul(0x85EB_CA6B))
    }

    fn next_u32(&mut self) -> u32 {
        // Numerical Recipes LCG
        self.state = self.state.wrapping_mul(1664525).wrapping_add(1013904223);
        (self.state >> 32) as u32
    }

    fn gen_range(&mut self, max_exclusive: usize) -> usize {
        if max_exclusive == 0 {
            return 0;
        }
        (self.next_u32() as usize) % max_exclusive
    }

    fn gen_i32(&mut self, min: i32, max_inclusive: i32) -> i32 {
        let span = (max_inclusive - min + 1).max(1) as u32;
        min + (self.next_u32() % span) as i32
    }
}

impl PlaceholderLanguage {
    pub fn parse(value: Option<&str>) -> Self {
        let raw = value.unwrap_or("la").trim().to_ascii_lowercase();
        if raw.starts_with("sk") {
            Self::Sk
        } else if raw.starts_with("en") {
            Self::En
        } else {
            Self::La
        }
    }

    fn bank(self) -> &'static [&'static str] {
        match self {
            Self::La => WORDS_LA,
            Self::En => WORDS_EN,
            Self::Sk => WORDS_SK,
        }
    }
}

impl PlaceholderUnit {
    pub fn parse(value: Option<&str>) -> Self {
        match value.unwrap_or("paragraphs").trim().to_ascii_lowercase().as_str() {
            "words" => Self::Words,
            "sentences" => Self::Sentences,
            _ => Self::Paragraphs,
        }
    }
}

fn clamp_count(count: u32, unit: PlaceholderUnit) -> u32 {
    match unit {
        PlaceholderUnit::Words => count.clamp(1, 2000),
        PlaceholderUnit::Sentences => count.clamp(1, 200),
        PlaceholderUnit::Paragraphs => count.clamp(1, 50),
    }
}

fn capitalize(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

fn build_words(
    rng: &mut Rng64,
    count: usize,
    language: PlaceholderLanguage,
    start_with_classic: bool,
) -> Vec<String> {
    let bank = language.bank();
    let mut words = Vec::with_capacity(count);
    if start_with_classic && language == PlaceholderLanguage::La {
        for word in CLASSIC_LEAD.iter().take(count) {
            words.push((*word).to_string());
        }
    }
    while words.len() < count {
        words.push(bank[rng.gen_range(bank.len())].to_string());
    }
    words.truncate(count);
    words
}

fn words_to_sentences(words: &[String], sentence_count: usize, rng: &mut Rng64) -> Vec<String> {
    if words.is_empty() || sentence_count == 0 {
        return Vec::new();
    }
    let mut sentences = Vec::new();
    let mut cursor = 0usize;
    for index in 0..sentence_count {
        let remaining_sentences = sentence_count - index;
        let remaining_words = words.len().saturating_sub(cursor);
        if remaining_words == 0 {
            break;
        }
        let take = if index + 1 == sentence_count {
            remaining_words
        } else {
            let target = (remaining_words / remaining_sentences).clamp(5, 14);
            let jitter = rng.gen_i32(-2, 2);
            let candidate = (target as i32 + jitter).max(3) as usize;
            candidate
                .min(remaining_words.saturating_sub(remaining_sentences.saturating_sub(1)).max(1))
                .max(1)
                .min(remaining_words)
        };
        let chunk = &words[cursor..cursor + take];
        cursor += take;
        if chunk.is_empty() {
            break;
        }
        let mut parts = chunk.to_vec();
        parts[0] = capitalize(&parts[0]);
        sentences.push(format!("{}.", parts.join(" ")));
    }
    sentences
}

fn sentences_to_paragraphs(sentences: &[String], paragraph_count: usize) -> Vec<String> {
    if sentences.is_empty() || paragraph_count == 0 {
        return Vec::new();
    }
    let mut paragraphs = Vec::new();
    let base = (sentences.len() / paragraph_count).max(1);
    let mut cursor = 0usize;
    for index in 0..paragraph_count {
        let remaining_paragraphs = paragraph_count - index;
        let remaining_sentences = sentences.len().saturating_sub(cursor);
        if remaining_sentences == 0 {
            break;
        }
        let take = if index + 1 == paragraph_count {
            remaining_sentences
        } else {
            (base + (index % 2))
                .max(1)
                .min(remaining_sentences - remaining_paragraphs + 1)
        };
        let chunk = &sentences[cursor..cursor + take];
        cursor += take;
        if !chunk.is_empty() {
            paragraphs.push(chunk.join(" "));
        }
    }
    paragraphs
}

/// Generate placeholder text locally (no Python sidecar required).
pub fn generate_placeholder(
    unit: PlaceholderUnit,
    count: u32,
    language: PlaceholderLanguage,
    start_with_classic: bool,
    seed: Option<u64>,
) -> PlaceholderResult {
    let count = clamp_count(count, unit);
    let mut rng = match seed {
        Some(value) => Rng64::new(value),
        None => Rng64::from_entropy(),
    };

    let text = match unit {
        PlaceholderUnit::Words => {
            let words = build_words(&mut rng, count as usize, language, start_with_classic);
            words.join(" ")
        }
        PlaceholderUnit::Sentences => {
            let approx_words = (count as usize * 8).max(count as usize);
            let words = build_words(&mut rng, approx_words, language, start_with_classic);
            words_to_sentences(&words, count as usize, &mut rng).join(" ")
        }
        PlaceholderUnit::Paragraphs => {
            let sentence_count = (count as usize * 4).max(count as usize);
            let approx_words = (sentence_count * 8).max(sentence_count);
            let words = build_words(&mut rng, approx_words, language, start_with_classic);
            let sentences = words_to_sentences(&words, sentence_count, &mut rng);
            sentences_to_paragraphs(&sentences, count as usize).join("\n\n")
        }
    };

    PlaceholderResult {
        text,
        unit,
        count,
        language,
        source: "rust".to_string(),
        start_with_classic,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_latin_paragraphs() {
        let result =
            generate_placeholder(PlaceholderUnit::Paragraphs, 2, PlaceholderLanguage::La, true, Some(7));
        assert_eq!(result.source, "rust");
        assert!(result.text.contains('.') || result.text.contains('\n'));
        assert!(result.text.to_lowercase().contains("lorem"));
    }

    #[test]
    fn generates_slovak_words() {
        let result =
            generate_placeholder(PlaceholderUnit::Words, 8, PlaceholderLanguage::Sk, false, Some(3));
        assert_eq!(result.count, 8);
        assert_eq!(result.text.split_whitespace().count(), 8);
    }
}
