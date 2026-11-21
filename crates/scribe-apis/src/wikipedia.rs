//! Wikipedia REST summary (opt-in network).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikipediaSummary {
    pub title: String,
    pub description: Option<String>,
    pub extract: String,
    pub url: String,
    pub lang: String,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WikiSummaryRaw {
    title: Option<String>,
    description: Option<String>,
    extract: Option<String>,
    content_urls: Option<ContentUrls>,
    thumbnail: Option<Thumb>,
}

#[derive(Debug, Deserialize)]
struct ContentUrls {
    desktop: Option<DesktopUrl>,
}

#[derive(Debug, Deserialize)]
struct DesktopUrl {
    page: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Thumb {
    source: Option<String>,
}

fn normalize_lang(lang: &str) -> String {
    let lang = lang.trim().to_ascii_lowercase();
    if lang.len() == 2 || lang.len() == 3 {
        lang
    } else {
        "en".into()
    }
}

pub fn summary(title: &str, lang: &str) -> ApiResult<WikipediaSummary> {
    let title = title.trim();
    if title.is_empty() {
        return Err(ApiError::invalid("empty title"));
    }
    let lang = normalize_lang(lang);
    let url = format!(
        "https://{lang}.wikipedia.org/api/rest_v1/page/summary/{}",
        urlencoding::encode(title)
    );
    let raw: WikiSummaryRaw = get_json(&url)?;
    let extract = raw.extract.unwrap_or_default().trim().to_string();
    if extract.is_empty() && raw.title.as_deref().unwrap_or("").is_empty() {
        return Err(ApiError::not_found("no Wikipedia summary"));
    }
    let page_title = raw.title.unwrap_or_else(|| title.to_string());
    let page_url = raw
        .content_urls
        .and_then(|c| c.desktop)
        .and_then(|d| d.page)
        .unwrap_or_else(|| format!("https://{lang}.wikipedia.org/wiki/{}", urlencoding::encode(&page_title)));
    Ok(WikipediaSummary {
        title: page_title,
        description: raw.description,
        extract,
        url: page_url,
        lang,
        thumbnail_url: raw.thumbnail.and_then(|t| t.source),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty() {
        assert!(summary("  ", "en").is_err());
    }
}
