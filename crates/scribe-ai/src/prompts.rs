//! Stable system / user prompt builders for local LLM calls.

use crate::budget::{trim_passages_to_char_budget, DEFAULT_PASSAGE_CHAR_BUDGET};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptKind {
    DocumentChat,
    LibraryChat,
    Agent,
    Rewrite,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PromptLocale {
    En,
    Sk,
    Cs,
    Hu,
    Pl,
}

fn prompt_locale(language: Option<&str>) -> PromptLocale {
    let code = language
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase()
        .replace('_', "-");
    let primary = code.split('-').next().unwrap_or("");
    match primary {
        "sk" => PromptLocale::Sk,
        "cs" => PromptLocale::Cs,
        "hu" => PromptLocale::Hu,
        "pl" => PromptLocale::Pl,
        _ => PromptLocale::En,
    }
}

pub fn system_prompt(kind: PromptKind, language: Option<&str>) -> String {
    let locale = prompt_locale(language);
    match (kind, locale) {
        (PromptKind::DocumentChat, PromptLocale::En) => {
            "You are Scribe's document assistant. Answer only from the provided note passages. Cite titles when you use a passage. If the note does not contain the answer, say so."
                .into()
        }
        (PromptKind::DocumentChat, PromptLocale::Sk) => {
            "Si asistent poznámky v Scribe. Odpovedaj len z poskytnutých pasáží. Cituj názvy, keď ich použiješ. Ak odpoveď v poznámke nie je, povedz to."
                .into()
        }
        (PromptKind::DocumentChat, PromptLocale::Cs) => {
            "Jsi asistent poznámky ve Scribe. Odpovídej jen z poskytnutých pasáží. Cituj názvy, když je použiješ. Pokud odpověď v poznámce není, řekni to."
                .into()
        }
        (PromptKind::DocumentChat, PromptLocale::Hu) => {
            "Te a Scribe jegyzet-asszisztense vagy. Csak a megadott részletekből válaszolj. Ha egy részt használsz, említsd a címet. Ha a válasz nincs a jegyzetben, mondd el."
                .into()
        }
        (PromptKind::DocumentChat, PromptLocale::Pl) => {
            "Jesteś asystentem notatki w Scribe. Odpowiadaj tylko na podstawie podanych fragmentów. Cytuj tytuły, gdy z nich korzystasz. Jeśli odpowiedzi nie ma w notatce, powiedz o tym."
                .into()
        }
        (PromptKind::LibraryChat, PromptLocale::En) => {
            "You are Scribe's library assistant. Use the ranked passages across notes. Prefer precise citations. Do not invent documents."
                .into()
        }
        (PromptKind::LibraryChat, PromptLocale::Sk) => {
            "Si asistent knižnice Scribe. Použi zoradené pasáže z poznámok. Preferuj presné citácie. Nevymýšľaj dokumenty."
                .into()
        }
        (PromptKind::LibraryChat, PromptLocale::Cs) => {
            "Jsi asistent knihovny Scribe. Použij seřazené pasáže z poznámek. Preferuj přesné citace. Nevymýšlej dokumenty."
                .into()
        }
        (PromptKind::LibraryChat, PromptLocale::Hu) => {
            "Te a Scribe könyvtár-asszisztense vagy. Használd a rangsorolt jegyzetrészleteket. Pontos idézeteket részesíts előnyben. Ne találj ki dokumentumokat."
                .into()
        }
        (PromptKind::LibraryChat, PromptLocale::Pl) => {
            "Jesteś asystentem biblioteki Scribe. Korzystaj z uszeregowanych fragmentów notatek. Preferuj precyzyjne cytaty. Nie wymyślaj dokumentów."
                .into()
        }
        (PromptKind::Agent, PromptLocale::En) => {
            "You are Scribe's local agent planner. Propose concrete next tools and short answers. Stay within the user's library context."
                .into()
        }
        (PromptKind::Agent, PromptLocale::Sk) => {
            "Si lokálny agent plánovač Scribe. Navrhni konkrétne nástroje a krátke odpovede. Zostaň v kontexte knižnice používateľa."
                .into()
        }
        (PromptKind::Agent, PromptLocale::Cs) => {
            "Jsi lokální agent plánovač Scribe. Navrhni konkrétní nástroje a krátké odpovědi. Zůstaň v kontextu uživatelské knihovny."
                .into()
        }
        (PromptKind::Agent, PromptLocale::Hu) => {
            "Te a Scribe helyi ügynök-tervezője vagy. Javasolj konkrét következő eszközöket és rövid válaszokat. Maradj a felhasználó könyvtárának kontextusában."
                .into()
        }
        (PromptKind::Agent, PromptLocale::Pl) => {
            "Jesteś lokalnym agentem planującym Scribe. Proponuj konkretne kolejne narzędzia i krótkie odpowiedzi. Pozostań w kontekście biblioteki użytkownika."
                .into()
        }
        (PromptKind::Rewrite, PromptLocale::En) => {
            "You rewrite the user's note text. Preserve meaning and structure unless asked otherwise. Return only the rewritten text."
                .into()
        }
        (PromptKind::Rewrite, PromptLocale::Sk) => {
            "Prepíšeš text poznámky. Zachovaj význam a štruktúru, pokiaľ nie je povedané inak. Vráť len prepísaný text."
                .into()
        }
        (PromptKind::Rewrite, PromptLocale::Cs) => {
            "Přepíšeš text poznámky. Zachovej význam a strukturu, pokud není řečeno jinak. Vrať jen přepsaný text."
                .into()
        }
        (PromptKind::Rewrite, PromptLocale::Hu) => {
            "Átírod a jegyzet szövegét. Őrizd meg a jelentést és a szerkezetet, hacsak mást nem kérnek. Csak az átírt szöveget add vissza."
                .into()
        }
        (PromptKind::Rewrite, PromptLocale::Pl) => {
            "Przepisujesz tekst notatki. Zachowaj znaczenie i strukturę, chyba że poproszono inaczej. Zwróć tylko przepisany tekst."
                .into()
        }
    }
}

/// Build a user message: question + trimmed passage JSON (or plain text for rewrite).
pub fn user_prompt(
    kind: PromptKind,
    question_or_text: &str,
    passages: Option<Value>,
    char_budget: Option<usize>,
) -> String {
    let q = question_or_text.trim();
    match kind {
        PromptKind::Rewrite => q.to_string(),
        _ => {
            let budget = char_budget.unwrap_or(DEFAULT_PASSAGE_CHAR_BUDGET);
            let body = match passages {
                Some(value) => trim_passages_to_char_budget(value, budget).to_string(),
                None => "[]".into(),
            };
            format!("Question:\n{q}\n\nPassages (JSON):\n{body}")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn builds_document_chat_user_prompt() {
        let prompt = user_prompt(
            PromptKind::DocumentChat,
            "When is the deadline?",
            Some(json!([{ "title": "Note", "snippet": "Friday." }])),
            Some(2000),
        );
        assert!(prompt.contains("Friday."));
        assert!(prompt.contains("When is the deadline?"));
    }

    #[test]
    fn system_prompt_covers_built_in_locales() {
        let sk = system_prompt(PromptKind::Agent, Some("sk"));
        let cs = system_prompt(PromptKind::Agent, Some("cs-CZ"));
        let hu = system_prompt(PromptKind::Agent, Some("hu"));
        let pl = system_prompt(PromptKind::Agent, Some("pl"));
        let en = system_prompt(PromptKind::Agent, Some("de"));
        assert!(sk.contains("Scribe"));
        assert!(cs.contains("Scribe"));
        assert!(hu.contains("Scribe"));
        assert!(pl.contains("Scribe"));
        assert!(en.contains("local agent"));
        assert_ne!(sk, cs);
        assert_ne!(cs, hu);
    }
}
