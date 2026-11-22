//! Podcast search via Apple iTunes Search API (no key).
//! Podcast Index requires API keys — iTunes covers the same discovery use-case.

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PodcastShow {
    pub title: String,
    pub artist: Option<String>,
    pub feed_url: Option<String>,
    pub artwork_url: Option<String>,
    pub genre: Option<String>,
    pub track_count: Option<i64>,
    pub country: Option<String>,
    pub itunes_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ItunesResponse {
    results: Option<Vec<ItunesHit>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ItunesHit {
    collection_name: Option<String>,
    track_name: Option<String>,
    artist_name: Option<String>,
    feed_url: Option<String>,
    artwork_url_600: Option<String>,
    artwork_url_100: Option<String>,
    primary_genre_name: Option<String>,
    track_count: Option<i64>,
    country: Option<String>,
    collection_view_url: Option<String>,
    track_view_url: Option<String>,
    kind: Option<String>,
    wrapper_type: Option<String>,
}

pub fn search_podcasts(query: &str, limit: usize) -> ApiResult<Vec<PodcastShow>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 20);
    let url = format!(
        "https://itunes.apple.com/search?media=podcast&entity=podcast&limit={limit}&term={}",
        urlencoding::encode(q)
    );
    let raw: ItunesResponse = get_json(&url)?;
    Ok(raw
        .results
        .unwrap_or_default()
        .into_iter()
        .filter(|hit| {
            hit.kind
                .as_deref()
                .map(|k| k.contains("podcast"))
                .unwrap_or(true)
                || hit.wrapper_type.as_deref() == Some("track")
                || hit.feed_url.is_some()
        })
        .filter_map(|hit| {
            let title = hit
                .collection_name
                .or(hit.track_name)?
                .trim()
                .to_string();
            if title.is_empty() {
                return None;
            }
            Some(PodcastShow {
                title,
                artist: hit.artist_name.filter(|s| !s.is_empty()),
                feed_url: hit.feed_url.filter(|s| !s.is_empty()),
                artwork_url: hit
                    .artwork_url_600
                    .or(hit.artwork_url_100)
                    .filter(|s| !s.is_empty()),
                genre: hit.primary_genre_name.filter(|s| !s.is_empty()),
                track_count: hit.track_count,
                country: hit.country.filter(|s| !s.is_empty()),
                itunes_url: hit
                    .collection_view_url
                    .or(hit.track_view_url)
                    .filter(|s| !s.is_empty()),
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
        assert!(search_podcasts("a", 3).is_err());
    }
}
