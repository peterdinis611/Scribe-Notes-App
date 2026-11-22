//! Europeana CC images via Openverse `source=europeana` (no Europeana API key).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use crate::openverse::LicensedImage;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct OpenverseResponse {
    results: Option<Vec<OpenverseHit>>,
}

#[derive(Debug, Deserialize)]
struct OpenverseHit {
    title: Option<String>,
    url: Option<String>,
    thumbnail: Option<String>,
    creator: Option<String>,
    license: Option<String>,
    license_url: Option<String>,
    foreign_landing_url: Option<String>,
    source: Option<String>,
}

pub fn search_images(query: &str, limit: usize) -> ApiResult<Vec<LicensedImage>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 20);
    let url = format!(
        "https://api.openverse.org/v1/images/?source=europeana&page_size={limit}&q={}",
        urlencoding::encode(q)
    );
    let raw: OpenverseResponse = get_json(&url)?;
    Ok(raw
        .results
        .unwrap_or_default()
        .into_iter()
        .filter_map(|hit| {
            let image_url = hit.url?.trim().to_string();
            if image_url.is_empty() {
                return None;
            }
            Some(LicensedImage {
                title: hit.title.unwrap_or_else(|| "Untitled".into()),
                url: image_url,
                thumbnail: hit.thumbnail,
                creator: hit.creator,
                license: hit.license,
                license_url: hit.license_url,
                foreign_landing_url: hit.foreign_landing_url,
                source: hit.source.or_else(|| Some("europeana".into())),
            })
        })
        .take(limit)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(search_images("a", 3).is_err());
    }
}
