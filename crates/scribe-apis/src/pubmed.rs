//! PubMed E-utilities (esearch + esummary) — free NCBI API.

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PubmedArticle {
    pub pmid: String,
    pub title: String,
    pub authors: Vec<String>,
    pub source: Option<String>,
    pub pub_date: Option<String>,
    pub url: String,
}

#[derive(Debug, Deserialize)]
struct ESearch {
    esearchresult: Option<ESearchResult>,
}

#[derive(Debug, Deserialize)]
struct ESearchResult {
    idlist: Option<Vec<String>>,
}

pub fn search_pubmed(query: &str, limit: usize) -> ApiResult<Vec<PubmedArticle>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 12);
    let search_url = format!(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax={limit}&term={}",
        urlencoding::encode(q)
    );
    let search: ESearch = get_json(&search_url)?;
    let ids = search
        .esearchresult
        .and_then(|r| r.idlist)
        .unwrap_or_default();
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let id_list = ids.join(",");
    let summary_url = format!(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id={id_list}"
    );
    let summary: Value = get_json(&summary_url)?;
    let result = summary
        .get("result")
        .cloned()
        .unwrap_or(Value::Object(Default::default()));
    let mut out = Vec::new();
    for id in ids {
        let Some(item) = result.get(&id) else {
            continue;
        };
        let title = item
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if title.is_empty() {
            continue;
        }
        let authors = item
            .get("authors")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|a| a.get("name").and_then(|n| n.as_str()).map(str::to_string))
                    .collect()
            })
            .unwrap_or_default();
        out.push(PubmedArticle {
            pmid: id.clone(),
            title,
            authors,
            source: item
                .get("source")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            pub_date: item
                .get("pubdate")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            url: format!("https://pubmed.ncbi.nlm.nih.gov/{id}/"),
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(search_pubmed("x", 3).is_err());
    }
}
