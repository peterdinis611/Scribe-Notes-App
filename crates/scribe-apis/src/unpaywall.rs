//! Unpaywall — OA PDF / best OA location for a DOI (email required as query param).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const DEFAULT_EMAIL: &str = "scribe-notes@users.noreply.github.com";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnpaywallResult {
    pub doi: String,
    pub title: Option<String>,
    pub is_oa: bool,
    pub oa_status: Option<String>,
    pub pdf_url: Option<String>,
    pub landing_page_url: Option<String>,
    pub host_type: Option<String>,
}

fn normalize_doi(doi: &str) -> ApiResult<String> {
    let d = doi
        .trim()
        .trim_start_matches("https://doi.org/")
        .trim_start_matches("http://doi.org/")
        .trim_start_matches("doi:")
        .trim();
    if d.len() < 7 || !d.contains('/') {
        return Err(ApiError::invalid("invalid DOI"));
    }
    Ok(d.to_string())
}

pub fn lookup_doi(doi: &str, email: Option<&str>) -> ApiResult<UnpaywallResult> {
    let doi = normalize_doi(doi)?;
    let email = email
        .map(str::trim)
        .filter(|s| s.contains('@'))
        .unwrap_or(DEFAULT_EMAIL);
    let url = format!(
        "https://api.unpaywall.org/v2/{}?email={}",
        urlencoding::encode(&doi),
        urlencoding::encode(email)
    );
    let raw: Value = get_json(&url)?;
    let best = raw.get("best_oa_location");
    Ok(UnpaywallResult {
        doi: raw
            .get("doi")
            .and_then(|v| v.as_str())
            .unwrap_or(&doi)
            .to_string(),
        title: raw
            .get("title")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        is_oa: raw.get("is_oa").and_then(|v| v.as_bool()).unwrap_or(false),
        oa_status: raw
            .get("oa_status")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        pdf_url: best
            .and_then(|b| b.get("url_for_pdf"))
            .and_then(|v| v.as_str())
            .or_else(|| best.and_then(|b| b.get("url")).and_then(|v| v.as_str()))
            .map(str::to_string),
        landing_page_url: best
            .and_then(|b| b.get("url_for_landing_page"))
            .and_then(|v| v.as_str())
            .or_else(|| best.and_then(|b| b.get("url")).and_then(|v| v.as_str()))
            .map(str::to_string),
        host_type: best
            .and_then(|b| b.get("host_type"))
            .and_then(|v| v.as_str())
            .map(str::to_string),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_doi() {
        assert!(lookup_doi("not-a-doi", None).is_err());
    }
}
