//! Datamuse — synonyms / means-like / related words (no key).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordSuggestion {
    pub word: String,
    pub score: Option<i64>,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct DmHit {
    word: Option<String>,
    score: Option<i64>,
    tags: Option<Vec<String>>,
}

fn map_hits(raw: Vec<DmHit>, limit: usize) -> Vec<WordSuggestion> {
    raw.into_iter()
        .filter_map(|h| {
            let word = h.word?.trim().to_string();
            if word.is_empty() {
                return None;
            }
            Some(WordSuggestion {
                word,
                score: h.score,
                tags: h.tags.unwrap_or_default(),
            })
        })
        .take(limit)
        .collect()
}

pub fn synonyms(word: &str, limit: usize) -> ApiResult<Vec<WordSuggestion>> {
    let word = word.trim();
    if word.len() < 2 {
        return Err(ApiError::invalid("word too short"));
    }
    let limit = limit.clamp(1, 30);
    let url = format!(
        "https://api.datamuse.com/words?max={limit}&rel_syn={}",
        urlencoding::encode(word)
    );
    let raw: Vec<DmHit> = get_json(&url)?;
    Ok(map_hits(raw, limit))
}

pub fn means_like(phrase: &str, limit: usize) -> ApiResult<Vec<WordSuggestion>> {
    let phrase = phrase.trim();
    if phrase.len() < 2 {
        return Err(ApiError::invalid("phrase too short"));
    }
    let limit = limit.clamp(1, 30);
    let url = format!(
        "https://api.datamuse.com/words?max={limit}&ml={}",
        urlencoding::encode(phrase)
    );
    let raw: Vec<DmHit> = get_json(&url)?;
    Ok(map_hits(raw, limit))
}

pub fn suggest(prefix: &str, limit: usize) -> ApiResult<Vec<WordSuggestion>> {
    let prefix = prefix.trim();
    if prefix.is_empty() {
        return Err(ApiError::invalid("prefix empty"));
    }
    let limit = limit.clamp(1, 20);
    let url = format!(
        "https://api.datamuse.com/sug?max={limit}&s={}",
        urlencoding::encode(prefix)
    );
    let raw: Vec<DmHit> = get_json(&url)?;
    Ok(map_hits(raw, limit))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(synonyms("a", 5).is_err());
    }
}
