//! Free Dictionary API + Wiktionary (MediaWiki) fallback.

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionarySense {
    pub part_of_speech: Option<String>,
    pub definition: String,
    pub example: Option<String>,
    pub synonyms: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryEntry {
    pub word: String,
    pub phonetic: Option<String>,
    pub source_urls: Vec<String>,
    pub senses: Vec<DictionarySense>,
    pub provider: String,
}

pub fn lookup_word(word: &str, lang: Option<&str>) -> ApiResult<DictionaryEntry> {
    let word = word.trim();
    if word.is_empty() || word.len() > 80 {
        return Err(ApiError::invalid("word length invalid"));
    }
    let lang = lang.unwrap_or("en").trim().to_ascii_lowercase();
    if lang.len() < 2 || lang.len() > 5 {
        return Err(ApiError::invalid("invalid language"));
    }
    match free_dictionary(word, &lang) {
        Ok(entry) if !entry.senses.is_empty() => Ok(entry),
        Ok(_) | Err(_) if lang == "en" || lang.starts_with("en") => wiktionary(word, &lang),
        Err(err) => Err(err),
        Ok(entry) => Ok(entry),
    }
}

fn free_dictionary(word: &str, lang: &str) -> ApiResult<DictionaryEntry> {
    let url = format!(
        "https://api.dictionaryapi.dev/api/v2/entries/{}/{}",
        urlencoding::encode(lang),
        urlencoding::encode(word)
    );
    let raw: Value = get_json(&url)?;
    let first = raw
        .as_array()
        .and_then(|a| a.first())
        .cloned()
        .ok_or_else(|| ApiError::not_found("no dictionary entry"))?;
    let mut senses = Vec::new();
    if let Some(meanings) = first.get("meanings").and_then(|v| v.as_array()) {
        for meaning in meanings {
            let pos = meaning
                .get("partOfSpeech")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let defs = meaning
                .get("definitions")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            for def in defs.iter().take(4) {
                let definition = def
                    .get("definition")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if definition.is_empty() {
                    continue;
                }
                let synonyms = def
                    .get("synonyms")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|s| s.as_str().map(str::to_string))
                            .take(6)
                            .collect()
                    })
                    .unwrap_or_default();
                senses.push(DictionarySense {
                    part_of_speech: pos.clone(),
                    definition,
                    example: def
                        .get("example")
                        .and_then(|v| v.as_str())
                        .map(str::to_string),
                    synonyms,
                });
            }
        }
    }
    let source_urls = first
        .get("sourceUrls")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|s| s.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    Ok(DictionaryEntry {
        word: first
            .get("word")
            .and_then(|v| v.as_str())
            .unwrap_or(word)
            .to_string(),
        phonetic: first
            .get("phonetic")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        source_urls,
        senses,
        provider: "dictionaryapi.dev".into(),
    })
}

fn wiktionary(word: &str, lang: &str) -> ApiResult<DictionaryEntry> {
    let url = format!(
        "https://{lang}.wiktionary.org/api/rest_v1/page/definition/{}",
        urlencoding::encode(word)
    );
    let raw: Value = match get_json(&url) {
        Ok(v) => v,
        Err(_) => {
            // MediaWiki action API fallback
            let api = format!(
                "https://{lang}.wiktionary.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&format=json&titles={}",
                urlencoding::encode(word)
            );
            let wiki: Value = get_json(&api)?;
            let pages = wiki
                .pointer("/query/pages")
                .and_then(|v| v.as_object())
                .ok_or_else(|| ApiError::not_found("no Wiktionary page"))?;
            let extract = pages
                .values()
                .find_map(|p| p.get("extract").and_then(|e| e.as_str()))
                .unwrap_or("")
                .trim();
            if extract.is_empty() {
                return Err(ApiError::not_found("no Wiktionary definition"));
            }
            return Ok(DictionaryEntry {
                word: word.to_string(),
                phonetic: None,
                source_urls: vec![format!("https://{lang}.wiktionary.org/wiki/{}", urlencoding::encode(word))],
                senses: vec![DictionarySense {
                    part_of_speech: None,
                    definition: extract.chars().take(600).collect(),
                    example: None,
                    synonyms: vec![],
                }],
                provider: "wiktionary".into(),
            });
        }
    };
    let mut senses = Vec::new();
    // REST definition shape: { "en": [ { "partOfSpeech": "...", "definitions": [ { "definition": "..." } ] } ] }
    if let Some(obj) = raw.as_object() {
        for (_lang_key, entries) in obj {
            let Some(arr) = entries.as_array() else { continue };
            for entry in arr {
                let pos = entry
                    .get("partOfSpeech")
                    .and_then(|v| v.as_str())
                    .map(str::to_string);
                let defs = entry
                    .get("definitions")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                for def in defs.iter().take(4) {
                    let definition = def
                        .get("definition")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    // Strip basic HTML tags from Wiktionary REST
                    let definition = strip_simple_html(&definition);
                    if definition.is_empty() {
                        continue;
                    }
                    senses.push(DictionarySense {
                        part_of_speech: pos.clone(),
                        definition,
                        example: None,
                        synonyms: vec![],
                    });
                }
            }
        }
    }
    if senses.is_empty() {
        return Err(ApiError::not_found("no Wiktionary definition"));
    }
    Ok(DictionaryEntry {
        word: word.to_string(),
        phonetic: None,
        source_urls: vec![format!("https://{lang}.wiktionary.org/wiki/{}", urlencoding::encode(word))],
        senses,
        provider: "wiktionary".into(),
    })
}

fn strip_simple_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty() {
        assert!(lookup_word("", None).is_err());
    }

    #[test]
    fn strips_html() {
        assert_eq!(strip_simple_html("<i>hello</i> world"), "hello world");
    }
}
