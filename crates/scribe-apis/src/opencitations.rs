//! OpenCitations — citation links for a DOI (no API key).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CitationLink {
    pub citing: String,
    pub cited: String,
    pub creation: Option<String>,
    pub timespan: Option<String>,
    pub journal_self_cite: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CitationBundle {
    pub doi: String,
    pub citing_count: usize,
    pub cited_by: Vec<CitationLink>,
    pub references: Vec<CitationLink>,
}

#[derive(Debug, Deserialize)]
struct OcRow {
    citing: Option<String>,
    cited: Option<String>,
    creation: Option<String>,
    timespan: Option<String>,
    #[serde(rename = "journal_sc")]
    journal_sc: Option<String>,
}

fn normalize_doi(doi: &str) -> ApiResult<String> {
    let d = doi
        .trim()
        .trim_start_matches("https://doi.org/")
        .trim_start_matches("http://doi.org/")
        .trim_start_matches("doi:")
        .trim()
        .to_string();
    if d.len() < 5 || !d.contains('/') {
        return Err(ApiError::invalid("invalid DOI"));
    }
    Ok(d)
}

fn map_row(row: OcRow) -> Option<CitationLink> {
    Some(CitationLink {
        citing: row.citing?.trim().to_string(),
        cited: row.cited?.trim().to_string(),
        creation: row.creation.filter(|s| !s.is_empty()),
        timespan: row.timespan.filter(|s| !s.is_empty()),
        journal_self_cite: row.journal_sc.filter(|s| !s.is_empty()),
    })
}

/// Citations *to* this DOI (who cites it) + references *from* it.
pub fn citations_for_doi(doi: &str, limit: usize) -> ApiResult<CitationBundle> {
    let doi = normalize_doi(doi)?;
    let limit = limit.clamp(1, 25);
    let encoded = urlencoding::encode(&doi);
    let cited_by_url =
        format!("https://opencitations.net/index/api/v1/citations/doi:{encoded}");
    let refs_url =
        format!("https://opencitations.net/index/api/v1/references/doi:{encoded}");

    let cited_raw: Vec<OcRow> = get_json(&cited_by_url).unwrap_or_default();
    let refs_raw: Vec<OcRow> = get_json(&refs_url).unwrap_or_default();

    let cited_by: Vec<_> = cited_raw.into_iter().filter_map(map_row).take(limit).collect();
    let references: Vec<_> = refs_raw.into_iter().filter_map(map_row).take(limit).collect();
    let citing_count = cited_by.len();

    Ok(CitationBundle {
        doi,
        citing_count,
        cited_by,
        references,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_doi() {
        assert!(citations_for_doi("nope", 3).is_err());
    }

    #[test]
    fn strips_prefix() {
        let d = normalize_doi("https://doi.org/10.1000/xyz").unwrap();
        assert_eq!(d, "10.1000/xyz");
    }
}
