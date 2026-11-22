//! DuckDuckGo Instant Answer API (no key; abstract / RelatedTopics).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstantAnswer {
    pub heading: String,
    pub abstract_text: String,
    pub abstract_url: Option<String>,
    pub answer: Option<String>,
    pub related: Vec<InstantRelated>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstantRelated {
    pub text: String,
    pub url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DdgRaw {
    #[serde(rename = "Heading")]
    heading: Option<String>,
    #[serde(rename = "AbstractText")]
    abstract_text: Option<String>,
    #[serde(rename = "AbstractURL")]
    abstract_url: Option<String>,
    #[serde(rename = "Answer")]
    answer: Option<String>,
    #[serde(rename = "RelatedTopics")]
    related_topics: Option<Vec<RelatedRaw>>,
}

#[derive(Debug, Deserialize)]
struct RelatedRaw {
    #[serde(rename = "Text")]
    text: Option<String>,
    #[serde(rename = "FirstURL")]
    first_url: Option<String>,
    #[serde(rename = "Topics")]
    topics: Option<Vec<RelatedRaw>>,
}

fn flatten_related(items: &[RelatedRaw], out: &mut Vec<InstantRelated>, limit: usize) {
    for item in items {
        if out.len() >= limit {
            return;
        }
        if let Some(text) = item.text.as_ref().map(|t| t.trim()).filter(|t| !t.is_empty()) {
            out.push(InstantRelated {
                text: text.to_string(),
                url: item.first_url.clone(),
            });
        }
        if let Some(nested) = &item.topics {
            flatten_related(nested, out, limit);
        }
    }
}

pub fn instant_answer(query: &str) -> ApiResult<InstantAnswer> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let url = format!(
        "https://api.duckduckgo.com/?q={}&format=json&no_html=1&skip_disambig=1",
        urlencoding::encode(q)
    );
    let raw: DdgRaw = get_json(&url)?;
    let mut related = Vec::new();
    if let Some(topics) = &raw.related_topics {
        flatten_related(topics, &mut related, 8);
    }
    let heading = raw.heading.unwrap_or_default();
    let abstract_text = raw.abstract_text.unwrap_or_default();
    let answer = raw.answer.filter(|s| !s.trim().is_empty());
    if heading.is_empty() && abstract_text.is_empty() && answer.is_none() && related.is_empty() {
        return Err(ApiError::not_found("no Instant Answer"));
    }
    Ok(InstantAnswer {
        heading,
        abstract_text,
        abstract_url: raw.abstract_url.filter(|s| !s.is_empty()),
        answer,
        related,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(instant_answer("x").is_err());
    }
}
