//! Freesound CC audio via Openverse `source=freesound` (no Freesound API key).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundClip {
    pub title: String,
    pub url: String,
    pub thumbnail: Option<String>,
    pub creator: Option<String>,
    pub license: Option<String>,
    pub license_url: Option<String>,
    pub foreign_landing_url: Option<String>,
    pub duration: Option<f64>,
    pub source: Option<String>,
}

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
    duration: Option<f64>,
    source: Option<String>,
}

pub fn search_sounds(query: &str, limit: usize) -> ApiResult<Vec<SoundClip>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 20);
    let url = format!(
        "https://api.openverse.org/v1/audio/?source=freesound&page_size={limit}&q={}",
        urlencoding::encode(q)
    );
    let raw: OpenverseResponse = get_json(&url)?;
    Ok(raw
        .results
        .unwrap_or_default()
        .into_iter()
        .filter_map(|hit| {
            let audio_url = hit.url?.trim().to_string();
            if audio_url.is_empty() {
                return None;
            }
            Some(SoundClip {
                title: hit.title.unwrap_or_else(|| "Untitled".into()),
                url: audio_url,
                thumbnail: hit.thumbnail,
                creator: hit.creator,
                license: hit.license,
                license_url: hit.license_url,
                foreign_landing_url: hit.foreign_landing_url,
                duration: hit.duration,
                source: hit.source.or_else(|| Some("freesound".into())),
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
        assert!(search_sounds("a", 3).is_err());
    }
}
