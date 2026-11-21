//! Quotable — random inspirational quotes (no key).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    pub content: String,
    pub author: Option<String>,
    pub tags: Vec<String>,
    pub url: Option<String>,
}

pub fn random_quote(tags: Option<&str>) -> ApiResult<Quote> {
    let mut url = "https://api.quotable.io/random".to_string();
    if let Some(t) = tags.map(str::trim).filter(|s| !s.is_empty()) {
        url.push_str(&format!("?tags={}", urlencoding::encode(t)));
    }
    let raw: Value = get_json(&url)?;
    let content = raw
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if content.is_empty() {
        return Err(ApiError::not_found("no quote"));
    }
    let id = raw.get("_id").and_then(|v| v.as_str());
    Ok(Quote {
        content,
        author: raw
            .get("author")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        tags: raw
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|t| t.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default(),
        url: id.map(|i| format!("https://quotable.io/quotes/{i}")),
    })
}
