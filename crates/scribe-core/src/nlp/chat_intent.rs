//! Document chat + agent intent router (EN/SK) — canonical for app + MCP.

fn strip_diacritic(ch: char) -> char {
    match ch {
        'á' | 'ä' | 'à' | 'â' | 'ã' => 'a',
        'é' | 'ě' | 'è' | 'ê' => 'e',
        'í' | 'ì' | 'î' => 'i',
        'ó' | 'ô' | 'ö' | 'ò' | 'õ' => 'o',
        'ú' | 'ů' | 'ü' | 'ù' | 'û' => 'u',
        'ý' | 'ỳ' => 'y',
        'č' | 'ć' => 'c',
        'ď' => 'd',
        'ň' | 'ń' => 'n',
        'ř' => 'r',
        'š' | 'ś' => 's',
        'ť' => 't',
        'ž' | 'ź' => 'z',
        'ľ' | 'ĺ' => 'l',
        other => other,
    }
}

/// Fold for intent matching: lowercase + strip common SK/CS diacritics.
fn fold_intent(question: &str) -> String {
    question
        .trim()
        .chars()
        .map(|ch| strip_diacritic(ch.to_lowercase().next().unwrap_or(ch)))
        .collect()
}

fn contains_any(hay: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| hay.contains(n))
}

fn intent_rules() -> &'static [(&'static str, &'static [&'static str])] {
    &[
        ("summarize", &["summarize", "summary", "tlldr", "digest", "zhrn", "zhrnutie", "strucne"]),
        ("outline", &["outline", "structure", "heading", "osnova", "struktura", "nadpisy"]),
        ("keywords", &["keyword", "key word", "klucove slova"]),
        (
            "tasks",
            &[
                "task",
                "todo",
                "to-do",
                "action item",
                "checklist",
                "what should i do next",
                "ulohy",
                "otvorene ulohy",
            ],
        ),
        (
            "dates",
            &[
                "date",
                "deadline",
                "due date",
                "schedule",
                "datumy",
                "terminy",
                "this week",
                "tento tyzden",
            ],
        ),
        (
            "mentions",
            &[
                "who is mentioned",
                "people mentioned",
                "mention",
                "kto je",
                "ludia",
                "spomenut",
                "zmienky",
            ],
        ),
        ("wiki", &["wiki link", "wikilink", "backlink", "wiki odkazy", "prepojen"]),
        (
            "similar",
            &[
                "related note",
                "similar note",
                "connected note",
                "how does this note connect",
                "how does this connect",
                "suvisiace",
                "podobne poznamky",
            ],
        ),
        ("quotes", &["key claim", "main claim", "klucove tvrden", "hlavne tvrden"]),
        ("tone", &["tone", "readability", "reading time", "ton", "citanie", "citatelnost"]),
        ("spellcheck", &["spellcheck", "spelling", "typo", "pravopis", "preklepy"]),
        ("title", &["suggest title", "suggested title", "better title", "navrhni nazov", "navrhnut nazov"]),
        (
            "questions",
            &["ask next", "follow-up question", "follow up question", "what else should i ask", "dalsie otazky"],
        ),
        ("flashcards", &["flashcard", "study card", "quiz me", "karticky", "kartick", "kviz"]),
        (
            "takeaways",
            &[
                "takeaway",
                "key point",
                "executive summary",
                "action item",
                "zavery",
                "hlavne body",
                "zhrnutie rozhodnut",
            ],
        ),
        (
            "terminology",
            &[
                "terminology",
                "term consistency",
                "inconsistent term",
                "terminologia",
                "konzistencia pojmov",
                "nekonzistent",
            ],
        ),
        (
            "style",
            &[
                "writing coach",
                "style tip",
                "clarity",
                "passive voice",
                "filler word",
                "styl",
                "jasnost",
                "trpny rod",
                "vyplnove",
            ],
        ),
        (
            "meeting",
            &[
                "meeting",
                "standup",
                "retro",
                "meeting notes",
                "zapis zo stretnut",
                "porada",
                "rozhodnutia zo stretnut",
            ],
        ),
        (
            "organize",
            &[
                "organize",
                "suggest folder",
                "suggest tag",
                "zarad",
                "priecinok",
                "tagy",
                "organizuj",
            ],
        ),
        (
            "duplicates",
            &[
                "duplicate",
                "redundant",
                "near duplicate",
                "duplicit",
                "redundantn",
                "podobne subory",
            ],
        ),
        (
            "citations",
            &["citation", "cite", "source for", "citac", "zdroje", "podloz"],
        ),
        (
            "quiz",
            &[
                "outline quiz",
                "quiz from outline",
                "kviz z osnovy",
                "test z osnovy",
            ],
        ),
        (
            "revision",
            &[
                "revision",
                "what changed",
                "diff summary",
                "co sa zmenilo",
                "revizia",
                "zmeny medzi",
            ],
        ),
        (
            "rewrite",
            &["rewrite", "rephrase", "prepis", "preformuluj"],
        ),
        (
            "brief",
            &[
                "agent brief",
                "document brief",
                "full brief",
                "kompletny brief",
                "brief poznamky",
            ],
        ),
    ]
}

/// Map free-form questions to structured document actions when the intent is clear.
pub fn match_document_chat_intent(question: &str) -> Option<&'static str> {
    let folded = fold_intent(question);
    if folded.is_empty() {
        return None;
    }

    for (action, needles) in intent_rules() {
        if contains_any(&folded, needles) {
            return Some(*action);
        }
    }
    None
}

const AGENT_INTENT_LIMIT: usize = 3;

/// Collect up to three matching intents for the local agent tool loop (ordered by rule priority).
pub fn match_agent_intents(question: &str) -> Vec<&'static str> {
    let folded = fold_intent(question);
    if folded.is_empty() {
        return Vec::new();
    }

    let mut out = Vec::new();
    for (action, needles) in intent_rules() {
        if contains_any(&folded, needles) {
            out.push(*action);
            if out.len() >= AGENT_INTENT_LIMIT {
                break;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_english_and_slovak() {
        assert_eq!(match_document_chat_intent("Summarize this note"), Some("summarize"));
        assert_eq!(match_document_chat_intent("Aké dátumy sú v poznámke?"), Some("dates"));
        assert_eq!(match_document_chat_intent("Who is mentioned in this note?"), Some("mentions"));
        assert_eq!(
            match_document_chat_intent("How does this note connect to others?"),
            Some("similar")
        );
        assert_eq!(match_document_chat_intent("Make flashcards from this"), Some("flashcards"));
        assert_eq!(match_document_chat_intent("What are the key takeaways?"), Some("takeaways"));
        assert_eq!(
            match_document_chat_intent("Check terminology consistency"),
            Some("terminology")
        );
        assert_eq!(match_document_chat_intent("Writing coach tips please"), Some("style"));
    }

    #[test]
    fn open_questions_do_not_match() {
        assert_eq!(match_document_chat_intent("What feels unfinished or unclear here?"), None);
        assert_eq!(match_document_chat_intent("What is this note mainly about?"), None);
        assert_eq!(match_document_chat_intent("Explain the key terms in this note"), None);
    }

    #[test]
    fn agent_collects_multiple_intents_capped_at_three() {
        let intents = match_agent_intents("Summarize this note and find related notes plus flashcards and tasks");
        assert_eq!(intents, vec!["summarize", "tasks", "similar"]);
        assert!(intents.len() <= 3);
    }

    #[test]
    fn agent_single_intent_still_works() {
        assert_eq!(match_agent_intents("Writing coach tips"), vec!["style"]);
        assert!(match_agent_intents("What is this about?").is_empty());
        assert_eq!(match_agent_intents("Deadlines this week"), vec!["dates"]);
        assert_eq!(match_agent_intents("Extract meeting notes"), vec!["meeting"]);
        assert_eq!(match_agent_intents("Find duplicate notes"), vec!["duplicates"]);
    }
}
