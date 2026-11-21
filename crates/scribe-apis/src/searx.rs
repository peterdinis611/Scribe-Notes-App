//! Searx / SearXNG JSON search (user-provided instance URL).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchHit {
    pub title: String,
    pub url: String,
    pub content: String,
    pub engine: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResult {
    pub query: String,
    pub instance: String,
    pub hits: Vec<WebSearchHit>,
}

#[derive(Debug, Deserialize)]
struct SearxResponse {
    results: Option<Vec<SearxHit>>,
}

#[derive(Debug, Deserialize)]
struct SearxHit {
    title: Option<String>,
    url: Option<String>,
    content: Option<String>,
    engine: Option<String>,
}

fn normalize_instance(base: &str) -> ApiResult<String> {
    let base = base.trim().trim_end_matches('/');
    if !(base.starts_with("https://") || base.starts_with("http://")) {
        return Err(ApiError::invalid("searx instance must be http(s) URL"));
    }
    // Block obvious non-loopback plaintext abuse later if needed; allow user instances.
    Ok(base.to_string())
}

pub fn search(instance: &str, query: &str, limit: usize) -> ApiResult<WebSearchResult> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let instance = normalize_instance(instance)?;
    let limit = limit.clamp(1, 12);
    let url = format!(
        "{instance}/search?q={}&format=json",
        urlencoding::encode(q)
    );
    let raw: SearxResponse = get_json(&url)?;
    let hits = raw
        .results
        .unwrap_or_default()
        .into_iter()
        .filter_map(|hit| {
            let title = hit.title?.trim().to_string();
            let url = hit.url?.trim().to_string();
            if title.is_empty() || url.is_empty() {
                return None;
            }
            Some(WebSearchHit {
                title,
                url,
                content: hit.content.unwrap_or_default(),
                engine: hit.engine,
            })
        })
        .take(limit)
        .collect();
    Ok(WebSearchResult {
        query: q.to_string(),
        instance,
        hits,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_instance() {
        assert!(search("not-a-url", "rust", 3).is_err());
    }
}
