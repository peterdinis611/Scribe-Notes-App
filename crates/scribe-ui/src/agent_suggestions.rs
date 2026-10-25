//! Agent goal chips + ranked tool options from note analysis signals.

use serde::{Deserialize, Serialize};

use crate::document_ask::{
    build_document_ask_questions, AskAnalysisInput, AskTaskInput, DocumentAskOptions,
};

const MAX_CHIPS: usize = 12;
const MAX_TOOLS: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentSuggestionAnalysis {
    #[serde(default)]
    pub outline: Vec<String>,
    #[serde(default)]
    pub keyphrases: Vec<String>,
    #[serde(default)]
    pub keywords: Vec<String>,
    #[serde(default)]
    pub mentions: Vec<String>,
    #[serde(default)]
    pub dates: Vec<String>,
    #[serde(default)]
    pub wiki_links: Vec<String>,
    #[serde(default)]
    pub hosts: Vec<String>,
    #[serde(default)]
    pub tone: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSuggestionTask {
    pub text: String,
    #[serde(default)]
    pub checked: bool,
}

fn unique_keep_order(items: impl IntoIterator<Item = String>, limit: usize) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for raw in items {
        let item = raw.split_whitespace().collect::<Vec<_>>().join(" ");
        if item.len() < 2 {
            continue;
        }
        let key = item.to_ascii_lowercase();
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
    let mut out: String = trimmed.chars().take(max.saturating_sub(1)).collect();
    while out.ends_with(' ') {
        out.pop();
    }
    out.push('…');
    out
}

pub fn build_agent_goal_chips(
    analysis: Option<&AgentSuggestionAnalysis>,
    tasks: &[AgentSuggestionTask],
    title: Option<&str>,
    slovak: bool,
) -> Vec<String> {
    let ask = analysis.map(|a| AskAnalysisInput {
        outline: a
            .outline
            .iter()
            .map(|t| crate::document_ask::AskOutlineItem { title: t.clone() })
            .collect(),
        keyphrases: a.keyphrases.clone(),
        keywords: a
            .keywords
            .iter()
            .map(|t| crate::document_ask::AskKeyword { term: t.clone() })
            .collect(),
        mentions: a.mentions.clone(),
        dates: a
            .dates
            .iter()
            .map(|d| crate::document_ask::AskDate {
                text: d.clone(),
                resolved_date: d.clone(),
            })
            .collect(),
        wiki_links: a.wiki_links.clone(),
        hosts: a.hosts.clone(),
        summary: a.summary.clone().unwrap_or_default(),
    });
    let ask_tasks: Vec<AskTaskInput> = tasks
        .iter()
        .map(|t| AskTaskInput {
            text: t.text.clone(),
            checked: t.checked,
        })
        .collect();
    let opts = DocumentAskOptions {
        title: title.map(str::to_string),
        slovak,
    };
    let mut chips = build_document_ask_questions(ask.as_ref(), &ask_tasks, &opts);
    chips.truncate(6);

    let open_tasks: Vec<&AgentSuggestionTask> = tasks.iter().filter(|t| !t.checked).collect();
    let headings = unique_keep_order(
        analysis
            .map(|a| a.outline.clone())
            .unwrap_or_default()
            .into_iter(),
        4,
    );
    let phrases = unique_keep_order(
        analysis
            .map(|a| {
                let mut v = a.keyphrases.clone();
                v.extend(a.keywords.clone());
                v
            })
            .unwrap_or_default()
            .into_iter(),
        4,
    );
    let people = unique_keep_order(
        analysis
            .map(|a| {
                a.mentions
                    .iter()
                    .map(|m| m.trim_start_matches('@').to_string())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default(),
        3,
    );
    let dates = unique_keep_order(
        analysis.map(|a| a.dates.clone()).unwrap_or_default().into_iter(),
        3,
    );
    let wiki = unique_keep_order(
        analysis
            .map(|a| a.wiki_links.clone())
            .unwrap_or_default()
            .into_iter(),
        2,
    );

    if let Some(task) = open_tasks.first() {
        chips.push(if slovak {
            format!("Pomôž dokončiť úlohu „{}“", clip(&task.text, 48))
        } else {
            format!("Help me finish “{}”", clip(&task.text, 48))
        });
    }
    if open_tasks.len() > 1 {
        chips.push(if slovak {
            format!("Zoradiť {} otvorených úloh podľa priority", open_tasks.len())
        } else {
            format!("Prioritize the {} open tasks in this note", open_tasks.len())
        });
    }
    if let Some(h) = headings.first() {
        chips.push(if slovak {
            format!("Prehĺb časť „{}“ a navrhni ďalšie kroky", clip(h, 48))
        } else {
            format!("Deep-dive “{}” and suggest next steps", clip(h, 48))
        });
    }
    if headings.len() > 1 {
        chips.push(if slovak {
            format!("Kvíz z osnovy (najmä „{}“)", clip(&headings[1], 48))
        } else {
            format!("Quiz me on the outline (esp. “{}”)", clip(&headings[1], 48))
        });
    }
    if let Some(p) = phrases.first() {
        chips.push(if slovak {
            format!("Nájdi súvisiace poznámky k „{}“", clip(p, 48))
        } else {
            format!("Find related notes about “{}”", clip(p, 48))
        });
    }
    if let Some(person) = people.first() {
        chips.push(if slovak {
            format!("Meeting wrap: čo ostáva voči {}?", clip(person, 48))
        } else {
            format!("Meeting wrap: what’s left with {}?", clip(person, 48))
        });
    }
    if let Some(d) = dates.first() {
        chips.push(if slovak {
            format!("Priprav checklist k termínu {}", clip(d, 48))
        } else {
            format!("Build a checklist for {}", clip(d, 48))
        });
    }
    if let Some(w) = wiki.first() {
        chips.push(if slovak {
            format!("Ako súvisí táto poznámka s [[{}]]?", clip(w, 48))
        } else {
            format!("How does this note connect to [[{}]]?", clip(w, 48))
        });
    } else if phrases.first().is_some() {
        chips.push(if slovak {
            "Navrhni wiki odkazy pre túto poznámku".into()
        } else {
            "Suggest wiki links for this note".into()
        });
    }

    if let Some(tone) = analysis.and_then(|a| a.tone.as_deref()) {
        chips.push(if slovak {
            format!("Writing coach: uprav tón ({})", clip(tone, 24))
        } else {
            format!("Writing coach: tighten the {} tone", clip(tone, 24))
        });
    } else {
        chips.push(if slovak {
            "Writing coach tipy pre túto poznámku".into()
        } else {
            "Writing coach tips for this note".into()
        });
    }

    let title = title.map(str::trim).filter(|t| t.len() >= 2 && !t.eq_ignore_ascii_case("untitled"));
    if let Some(title) = title {
        chips.push(if slovak {
            format!("Čo ešte chýba v „{}“?", clip(title, 48))
        } else {
            format!("What is still missing in “{}”?", clip(title, 48))
        });
        chips.push(if slovak {
            format!("Zhrň „{}“ do 5 odrážok", clip(title, 48))
        } else {
            format!("Summarize “{}” in 5 bullets", clip(title, 48))
        });
    } else {
        chips.push(if slovak {
            "Zhrň túto poznámku a nájdi súvisiace".into()
        } else {
            "Summarize this note and find related notes".into()
        });
    }

    if open_tasks.is_empty() {
        chips.push(if slovak {
            "Hlavné závery z tejto poznámky".into()
        } else {
            "Key takeaways from this note".into()
        });
    }
    chips.push(if slovak {
        "Skontroluj pravopis v tejto poznámke".into()
    } else {
        "Check spelling in this note".into()
    });
    chips.push(if slovak {
        "Organizuj tagy a priečinok".into()
    } else {
        "Organize tags and folder for this note".into()
    });

    unique_keep_order(chips, MAX_CHIPS)
}

pub fn build_agent_tool_options(
    analysis: Option<&AgentSuggestionAnalysis>,
    tasks: &[AgentSuggestionTask],
) -> Vec<String> {
    let open_tasks = tasks.iter().filter(|t| !t.checked).count();
    let mention_count = analysis
        .map(|a| a.mentions.len() + a.wiki_links.len() + a.hosts.len())
        .unwrap_or(0);
    let dates = analysis.map(|a| a.dates.len()).unwrap_or(0);
    let outline = analysis.map(|a| a.outline.len()).unwrap_or(0);
    let keywords = analysis.map(|a| a.keywords.len()).unwrap_or(0);
    let wiki = analysis.map(|a| a.wiki_links.len()).unwrap_or(0);
    let keyphrases = analysis.map(|a| a.keyphrases.len()).unwrap_or(0);
    let has_tone = analysis.and_then(|a| a.tone.as_ref()).is_some();

    let mut ranked: Vec<(&str, i32)> = vec![
        ("summarize", 100),
        ("takeaways", 96),
        ("document_answer", 92),
        ("dates", if dates > 0 { 94 } else { 30 }),
        (
            "meeting",
            if mention_count > 0 || open_tasks > 0 {
                86
            } else {
                48
            },
        ),
        ("outline", if outline > 0 { 90 } else { 40 }),
        ("quiz", if outline > 1 { 82 } else { 28 }),
        ("flashcards", if outline > 1 { 84 } else { 42 }),
        ("tasks", if open_tasks > 0 { 91 } else { 22 }),
        ("terminology", if keywords > 2 { 72 } else { 50 }),
        ("wiki", if wiki > 0 { 74 } else { 56 }),
        ("organize", 62),
        ("spellcheck", 76),
        ("similar", if keyphrases > 0 { 68 } else { 50 }),
        ("style", if has_tone { 70 } else { 54 }),
        ("explain", 66),
        ("simplify", 58),
        ("action_items", if open_tasks > 0 { 88 } else { 46 }),
        ("glossary", if keywords > 2 { 78 } else { 44 }),
    ];
    ranked.sort_by(|a, b| b.1.cmp(&a.1));
    ranked
        .into_iter()
        .take(MAX_TOOLS)
        .map(|(tool, _)| tool.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chips_and_tools_non_empty() {
        let analysis = AgentSuggestionAnalysis {
            outline: vec!["Intro".into(), "Body".into()],
            keyphrases: vec!["launch".into()],
            ..Default::default()
        };
        let tasks = vec![AgentSuggestionTask {
            text: "Ship it".into(),
            checked: false,
        }];
        let chips = build_agent_goal_chips(Some(&analysis), &tasks, Some("Plan"), false);
        assert!(!chips.is_empty());
        let tools = build_agent_tool_options(Some(&analysis), &tasks);
        assert_eq!(tools[0], "summarize");
    }
}
