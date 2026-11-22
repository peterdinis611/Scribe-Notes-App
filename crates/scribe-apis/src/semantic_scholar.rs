//! Semantic Scholar Graph API (paper search, no key for light use).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScholarPaper {
    pub paper_id: String,
    pub title: String,
    pub abstract_text: Option<String>,
    pub year: Option<i64>,
    pub authors: Vec<String>,
    pub url: Option<String>,
    pub venue: Option<String>,
    pub citation_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct S2Response {
    data: Option<Vec<S2Paper>>,
}

#[derive(Debug, Deserialize)]
struct S2Paper {
    #[serde(rename = "paperId")]
    paper_id: Option<String>,
    title: Option<String>,
    #[serde(rename = "abstract")]
    abstract_text: Option<String>,
    year: Option<i64>,
    authors: Option<Vec<S2Author>>,
    url: Option<String>,
    venue: Option<String>,
    #[serde(rename = "citationCount")]
    citation_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct S2Author {
    name: Option<String>,
}

pub fn search_papers(query: &str, limit: usize) -> ApiResult<Vec<ScholarPaper>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 12);
    let url = format!(
        "https://api.semanticscholar.org/graph/v1/paper/search?limit={limit}&fields=title,abstract,year,authors,url,venue,citationCount&query={}",
        urlencoding::encode(q)
    );
    let raw: S2Response = get_json(&url)?;
    Ok(raw
        .data
        .unwrap_or_default()
        .into_iter()
        .filter_map(|p| {
            let title = p.title?.trim().to_string();
            if title.is_empty() {
                return None;
            }
            let paper_id = p.paper_id.unwrap_or_default();
            Some(ScholarPaper {
                paper_id: paper_id.clone(),
                title,
                abstract_text: p.abstract_text,
                year: p.year,
                authors: p
                    .authors
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|a| a.name)
                    .collect(),
                url: p.url.or_else(|| {
                    if paper_id.is_empty() {
                        None
                    } else {
                        Some(format!("https://www.semanticscholar.org/paper/{paper_id}"))
                    }
                }),
                venue: p.venue,
                citation_count: p.citation_count,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(search_papers("a", 3).is_err());
    }
}
