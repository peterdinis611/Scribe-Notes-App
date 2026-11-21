//! Crossref works search (scholarly citations; polite pool via UA).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossrefWork {
    pub title: String,
    pub doi: Option<String>,
    pub authors: Vec<String>,
    pub published: Option<String>,
    pub container_title: Option<String>,
    pub url: Option<String>,
    pub type_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CrossrefResponse {
    message: CrossrefMessage,
}

#[derive(Debug, Deserialize)]
struct CrossrefMessage {
    items: Option<Vec<CrossrefItem>>,
}

#[derive(Debug, Deserialize)]
struct CrossrefItem {
    title: Option<Vec<String>>,
    #[serde(rename = "DOI")]
    doi: Option<String>,
    author: Option<Vec<CrossrefAuthor>>,
    #[serde(rename = "container-title")]
    container_title: Option<Vec<String>>,
    #[serde(rename = "type")]
    type_name: Option<String>,
    #[serde(rename = "URL")]
    url: Option<String>,
    published: Option<DateParts>,
    #[serde(rename = "published-print")]
    published_print: Option<DateParts>,
}

#[derive(Debug, Deserialize)]
struct CrossrefAuthor {
    given: Option<String>,
    family: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DateParts {
    #[serde(rename = "date-parts")]
    date_parts: Option<Vec<Vec<i64>>>,
}

fn format_date(parts: Option<&DateParts>) -> Option<String> {
    let nums = parts?.date_parts.as_ref()?.first()?;
    if nums.is_empty() {
        return None;
    }
    Some(
        nums.iter()
            .map(|n| n.to_string())
            .collect::<Vec<_>>()
            .join("-"),
    )
}

pub fn search_works(query: &str, limit: usize) -> ApiResult<Vec<CrossrefWork>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 12);
    let url = format!(
        "https://api.crossref.org/works?rows={limit}&query={}",
        urlencoding::encode(q)
    );
    let raw: CrossrefResponse = get_json(&url)?;
    Ok(raw
        .message
        .items
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| {
            let title = item.title?.into_iter().next()?.trim().to_string();
            if title.is_empty() {
                return None;
            }
            let authors = item
                .author
                .unwrap_or_default()
                .into_iter()
                .map(|a| {
                    match (a.given, a.family) {
                        (Some(g), Some(f)) => format!("{g} {f}"),
                        (None, Some(f)) => f,
                        (Some(g), None) => g,
                        _ => String::new(),
                    }
                })
                .filter(|s| !s.is_empty())
                .collect();
            Some(CrossrefWork {
                title,
                doi: item.doi,
                authors,
                published: format_date(item.published.as_ref())
                    .or_else(|| format_date(item.published_print.as_ref())),
                container_title: item
                    .container_title
                    .and_then(|v| v.into_iter().next()),
                url: item.url,
                type_name: item.type_name,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(search_works("x", 3).is_err());
    }
}
