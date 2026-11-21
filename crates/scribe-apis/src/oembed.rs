//! oEmbed via noembed.com — title/thumbnail for video/page URLs (no key).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OEmbedInfo {
    pub url: String,
    pub title: Option<String>,
    pub author_name: Option<String>,
    pub provider_name: Option<String>,
    pub thumbnail_url: Option<String>,
    pub html: Option<String>,
    pub typ: Option<String>,
}

pub fn resolve(url: &str) -> ApiResult<OEmbedInfo> {
    let url = url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(ApiError::invalid("url must be http(s)"));
    }
    let api = format!(
        "https://noembed.com/embed?url={}",
        urlencoding::encode(url)
    );
    let raw: Value = get_json(&api)?;
    if let Some(err) = raw.get("error").and_then(|v| v.as_str()) {
        return Err(ApiError::not_found(err.to_string()));
    }
    Ok(OEmbedInfo {
        url: raw
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or(url)
            .to_string(),
        title: raw
            .get("title")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        author_name: raw
            .get("author_name")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        provider_name: raw
            .get("provider_name")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        thumbnail_url: raw
            .get("thumbnail_url")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        html: raw.get("html").and_then(|v| v.as_str()).map(str::to_string),
        typ: raw
            .get("type")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_url() {
        assert!(resolve("youtube.com/watch").is_err());
    }
}
