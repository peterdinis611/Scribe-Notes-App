//! Flashcard export string builders (Anki TSV + Markdown).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardInput {
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub question: String,
    #[serde(default)]
    pub answer: String,
    #[serde(default)]
    pub front: Option<String>,
}

fn card_front(card: &FlashcardInput) -> String {
    let from_front = card.front.as_deref().unwrap_or("").trim();
    if !from_front.is_empty() {
        return from_front.to_string();
    }
    card.question.trim().to_string()
}

fn card_back(card: &FlashcardInput) -> String {
    card.answer.trim().to_string()
}

/// Anki “Text” import: tab-separated Front / Back (one card per line).
pub fn flashcards_to_anki_tsv(cards: &[FlashcardInput]) -> String {
    cards
        .iter()
        .map(|card| {
            let front = card_front(card)
                .replace('\t', " ")
                .replace("\r\n", "<br>")
                .replace('\n', "<br>");
            let back = card_back(card)
                .replace('\t', " ")
                .replace("\r\n", "<br>")
                .replace('\n', "<br>");
            format!("{front}\t{back}")
        })
        .filter(|line| line != "\t")
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn flashcards_to_markdown(cards: &[FlashcardInput], title: Option<&str>) -> String {
    let mut lines = Vec::new();
    if let Some(t) = title.map(str::trim).filter(|t| !t.is_empty()) {
        lines.push(format!("# {t}"));
        lines.push(String::new());
    }
    for (index, card) in cards.iter().enumerate() {
        let front = card_front(card);
        let back = card_back(card);
        if front.is_empty() && back.is_empty() {
            continue;
        }
        let heading = if front.is_empty() { "—" } else { front.as_str() };
        lines.push(format!("## {}. {heading}", index + 1));
        if let Some(kind) = card.kind.as_deref().filter(|k| !k.is_empty()) {
            lines.push(format!("*{kind}*"));
        }
        lines.push(String::new());
        lines.push(if back.is_empty() {
            "—".into()
        } else {
            back
        });
        lines.push(String::new());
    }
    let mut out = lines.join("\n");
    while out.ends_with('\n') {
        out.pop();
    }
    out.push('\n');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anki_tsv_line() {
        let cards = [FlashcardInput {
            kind: Some("qa".into()),
            question: "Q?".into(),
            answer: "A".into(),
            front: None,
        }];
        assert_eq!(flashcards_to_anki_tsv(&cards), "Q?\tA");
    }

    #[test]
    fn markdown_with_title() {
        let cards = [FlashcardInput {
            kind: Some("qa".into()),
            question: "Hello".into(),
            answer: "World".into(),
            front: None,
        }];
        let md = flashcards_to_markdown(&cards, Some("Deck"));
        assert!(md.starts_with("# Deck\n"));
        assert!(md.contains("## 1. Hello"));
        assert!(md.contains("*qa*"));
        assert!(md.contains("World"));
    }
}
