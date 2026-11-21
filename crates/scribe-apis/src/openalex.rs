//! OpenAlex — scholarly works search (no key; polite mailto in UA already).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAlexWork {
    pub id: String,
    pub title: String,
    pub year: Option<i64>,
    pub doi: Option<String>,
    pub authors: Vec<String>,
    pub cited_by_count: Option<i64>,
    pub oa_url: Option<String>,
    pub abstract_text: Option<String>,
    pub url: Option<String>,
}

fn map_work(w: &Value) -> Option<OpenAlexWork> {
    let title = w
        .get("display_name")
        .or_else(|| w.get("title"))
        .and_then(|v| v.as_str())?
        .trim()
        .to_string();
    if title.is_empty() {
        return None;
    }
    let id = w
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let authors = w
        .get("authorships")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    a.pointer("/author/display_name")
                        .and_then(|v| v.as_str())
                        .map(str::to_string)
                })
                .take(8)
                .collect()
        })
        .unwrap_or_default();
    let doi = w
        .get("doi")
        .and_then(|v| v.as_str())
        .map(|s| s.trim_start_matches("https://doi.org/").to_string());
    Some(OpenAlexWork {
        id: id.clone(),
        title,
        year: w.get("publication_year").and_then(|v| v.as_i64()),
        doi,
        authors,
        cited_by_count: w.get("cited_by_count").and_then(|v| v.as_i64()),
        oa_url: w
            .pointer("/open_access/oa_url")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        abstract_text: None, // OpenAlex inverted index — skip for brevity
        url: if id.is_empty() { None } else { Some(id) },
    })
}

pub fn search_works(query: &str, limit: usize) -> ApiResult<Vec<OpenAlexWork>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 15);
    let url = format!(
        "https://api.openalex.org/works?per-page={limit}&search={}",
        urlencoding::encode(q)
    );
    let raw: Value = get_json(&url)?;
    let results = raw
        .get("results")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(results.iter().filter_map(map_work).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(search_works("x", 3).is_err());
    }
}
