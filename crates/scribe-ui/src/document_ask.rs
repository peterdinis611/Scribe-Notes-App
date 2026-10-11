//! Per-document ask chips / ranked actions (`src/lib/library/document-ask-suggestions.ts`).

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

const MAX_QUESTIONS: usize = 10;
const MAX_ACTIONS: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AskOutlineItem {
    #[serde(default)]
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AskKeyword {
    #[serde(default)]
    pub term: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AskDate {
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub resolved_date: String,
}

/// Minimal NLP analysis slice the ask builders need.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AskAnalysisInput {
    #[serde(default)]
    pub outline: Vec<AskOutlineItem>,
    #[serde(default)]
    pub keyphrases: Vec<String>,
    #[serde(default)]
    pub keywords: Vec<AskKeyword>,
    #[serde(default)]
    pub mentions: Vec<String>,
    #[serde(default)]
    pub dates: Vec<AskDate>,
    #[serde(default)]
    pub wiki_links: Vec<String>,
    #[serde(default)]
    pub hosts: Vec<String>,
    #[serde(default)]
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AskTaskInput {
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub checked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct DocumentAskOptions {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub slovak: bool,
}

fn unique_keep_order(items: impl IntoIterator<Item = String>, limit: usize) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for raw in items {
        let item = raw.split_whitespace().collect::<Vec<_>>().join(" ");
        if item.len() < 2 {
            continue;
        }
        let key = item.to_lowercase();
        if !seen.insert(key) {
            continue;
        }
        out.push(item);
        if out.len() >= limit {
            break;
        }
    }
    out
}

fn clip(text: &str, max: usize) -> String {
    let trimmed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if trimmed.chars().count() <= max {
        return trimmed;
    }
    let truncated: String = trimmed.chars().take(max.saturating_sub(1)).collect();
    format!("{}…", truncated.trim_end())
}

/// Build ask-chips from this note’s analysis so every document gets different questions.
pub fn build_document_ask_questions(
    analysis: Option<&AskAnalysisInput>,
    tasks: &[AskTaskInput],
    opts: &DocumentAskOptions,
) -> Vec<String> {
    let slovak = opts.slovak;
    let mut questions = Vec::new();

    if let Some(title) = opts.title.as_deref().map(str::trim).filter(|t| t.len() >= 2) {
        if !title.eq_ignore_ascii_case("untitled") {
            let clipped = clip(title, 56);
            questions.push(if slovak {
                format!("O čom je poznámka „{clipped}“?")
            } else {
                format!("What is “{clipped}” mainly about?")
            });
        }
    }

    let empty = AskAnalysisInput::default();
    let analysis = analysis.unwrap_or(&empty);

    let headings = unique_keep_order(
        analysis.outline.iter().map(|item| item.title.clone()),
        5,
    );
    for heading in &headings {
        let clipped = clip(heading, 56);
        questions.push(if slovak {
            format!("Čo hovorí táto poznámka v časti „{clipped}“?")
        } else {
            format!("What does this note say in “{clipped}”?")
        });
    }

    let phrases = unique_keep_order(
        analysis
            .keyphrases
            .iter()
            .cloned()
            .chain(analysis.keywords.iter().map(|k| k.term.clone())),
        5,
    );
    for phrase in &phrases {
        if headings
            .iter()
            .any(|h| h.eq_ignore_ascii_case(phrase.as_str()))
        {
            continue;
        }
        let clipped = clip(phrase, 56);
        questions.push(if slovak {
            format!("Čo hovorí táto poznámka o „{clipped}“?")
        } else {
            format!("What does this note say about “{clipped}”?")
        });
    }

    for person in unique_keep_order(analysis.mentions.iter().cloned(), 4) {
        let label = person.trim_start_matches('@');
        let clipped = clip(label, 56);
        questions.push(if slovak {
            format!("Čo je tu o {clipped}?")
        } else {
            format!("What does this note say about {clipped}?")
        });
    }

    let open_tasks = unique_keep_order(
        tasks
            .iter()
            .filter(|t| !t.checked)
            .map(|t| t.text.clone()),
        3,
    );
    for task in &open_tasks {
        let clipped = clip(task, 56);
        questions.push(if slovak {
            format!("Aký je stav úlohy „{clipped}“?")
        } else {
            format!("What’s the status of “{clipped}”?")
        });
    }

    for date in unique_keep_order(
        analysis.dates.iter().map(|d| {
            if d.resolved_date.trim().is_empty() {
                d.text.clone()
            } else {
                d.resolved_date.clone()
            }
        }),
        3,
    ) {
        let clipped = clip(&date, 56);
        questions.push(if slovak {
            format!("Čo sa viaže k dátumu {clipped}?")
        } else {
            format!("What is tied to {clipped}?")
        });
    }

    for link in unique_keep_order(analysis.wiki_links.iter().cloned(), 2) {
        let clipped = clip(&link, 56);
        questions.push(if slovak {
            format!("Ako táto poznámka nadväzuje na [[{clipped}]]?")
        } else {
            format!("How does this note follow on from [[{clipped}]]?")
        });
    }

    if !analysis.summary.trim().is_empty() {
        questions.push(if slovak {
            "Súhlasí zhrnutie s tým, čo som chcel povedať?".into()
        } else {
            "Does the summary match what I meant to say?".into()
        });
    }

    if questions.len() < 4 {
        questions.push(if slovak {
            "Čo by som mal urobiť ďalej podľa tejto poznámky?".into()
        } else {
            "What should I do next based on this note?".into()
        });
        questions.push(if slovak {
            "Aké rozhodnutia alebo závery sú v tejto poznámke?".into()
        } else {
            "What decisions or conclusions are in this note?".into()
        });
        questions.push(if slovak {
            "Aké otvorené otázky ostávajú v tejto poznámke?".into()
        } else {
            "What open questions remain in this note?".into()
        });
    }

    unique_keep_order(questions, MAX_QUESTIONS)
}

/// Prefer actions that match signals present in this note.
pub fn build_document_ask_actions(
    analysis: Option<&AskAnalysisInput>,
    tasks: &[AskTaskInput],
) -> Vec<String> {
    let empty = AskAnalysisInput::default();
    let analysis = analysis.unwrap_or(&empty);
    let open_tasks = tasks.iter().filter(|t| !t.checked).count();

    let mut ranked: Vec<(&str, i32)> = vec![
        ("summarize", 100),
        ("takeaways", 96),
        ("questions", 95),
        (
            "outline",
            if analysis.outline.is_empty() { 40 } else { 90 },
        ),
        (
            "quotes",
            if analysis.keyphrases.is_empty() { 35 } else { 85 },
        ),
        (
            "flashcards",
            if analysis.outline.len() > 1 { 84 } else { 42 },
        ),
        (
            "keywords",
            if analysis.keywords.is_empty() { 30 } else { 80 },
        ),
        ("tasks", if open_tasks > 0 { 88 } else { 20 }),
        (
            "dates",
            if analysis.dates.is_empty() { 18 } else { 82 },
        ),
        (
            "mentions",
            if analysis.mentions.is_empty()
                && analysis.wiki_links.is_empty()
                && analysis.hosts.is_empty()
            {
                15
            } else {
                78
            },
        ),
        (
            "wiki",
            if analysis.wiki_links.is_empty() { 25 } else { 70 },
        ),
        ("style", 58),
        ("explain", 64),
        ("simplify", 60),
        ("action_items", if open_tasks > 0 { 86 } else { 48 }),
        (
            "glossary",
            if analysis.keywords.len() > 2 { 76 } else { 44 },
        ),
        ("terminology", 52),
        ("similar", 55),
        ("tone", 50),
    ];

    ranked.sort_by(|a, b| b.1.cmp(&a.1));
    ranked
        .into_iter()
        .take(MAX_ACTIONS)
        .map(|(action, _)| action.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_title_and_fallbacks() {
        let qs = build_document_ask_questions(
            None,
            &[],
            &DocumentAskOptions {
                title: Some("Sprint plan".into()),
                slovak: false,
            },
        );
        assert!(qs[0].contains("Sprint plan"));
        assert!(qs.len() <= MAX_QUESTIONS);
        assert!(qs.len() >= 4);
    }

    #[test]
    fn ranks_tasks_when_open() {
        let actions = build_document_ask_actions(
            None,
            &[AskTaskInput {
                text: "Ship".into(),
                checked: false,
            }],
        );
        assert_eq!(actions.len(), MAX_ACTIONS);
        assert!(actions.contains(&"tasks".to_string()));
    }
}
