//! MusicBrainz recording/release search + Cover Art Archive.

use crate::error::{ApiError, ApiResult};
use crate::http::{get_json, get_json_with_headers};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicRelease {
    pub id: String,
    pub title: String,
    pub artist: Option<String>,
    pub date: Option<String>,
    pub url: String,
    pub cover_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MbSearch {
    releases: Option<Vec<MbRelease>>,
}

#[derive(Debug, Deserialize)]
struct MbRelease {
    id: Option<String>,
    title: Option<String>,
    date: Option<String>,
    #[serde(rename = "artist-credit")]
    artist_credit: Option<Vec<MbArtistCredit>>,
}

#[derive(Debug, Deserialize)]
struct MbArtistCredit {
    name: Option<String>,
    artist: Option<MbArtist>,
}

#[derive(Debug, Deserialize)]
struct MbArtist {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CoverArt {
    images: Option<Vec<CoverImage>>,
}

#[derive(Debug, Deserialize)]
struct CoverImage {
    front: Option<bool>,
    image: Option<String>,
    thumbnails: Option<CoverThumbs>,
}

#[derive(Debug, Deserialize)]
struct CoverThumbs {
    small: Option<String>,
    large: Option<String>,
}

fn mb_headers() -> [(&'static str, &'static str); 1] {
    // MusicBrainz asks for a descriptive UA (already set) + JSON accept.
    [("Accept", "application/json")]
}

pub fn search_releases(query: &str, limit: usize) -> ApiResult<Vec<MusicRelease>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 10);
    let url = format!(
        "https://musicbrainz.org/ws/2/release/?fmt=json&limit={limit}&query={}",
        urlencoding::encode(q)
    );
    let raw: MbSearch = get_json_with_headers(&url, &mb_headers())?;
    Ok(raw
        .releases
        .unwrap_or_default()
        .into_iter()
        .filter_map(|rel| {
            let id = rel.id?;
            let title = rel.title?.trim().to_string();
            if title.is_empty() {
                return None;
            }
            let artist = rel.artist_credit.and_then(|credits| {
                credits.into_iter().next().and_then(|c| {
                    c.name
                        .or_else(|| c.artist.and_then(|a| a.name))
                })
            });
            Some(MusicRelease {
                id: id.clone(),
                title,
                artist,
                date: rel.date,
                url: format!("https://musicbrainz.org/release/{id}"),
                // Cover Art Archive is a separate call (rate limits) — use `cover_art`.
                cover_url: None,
            })
        })
        .collect())
}


pub fn cover_art(release_mbid: &str) -> ApiResult<Option<String>> {
    let id = release_mbid.trim();
    if id.len() < 8 {
        return Err(ApiError::invalid("invalid MusicBrainz release id"));
    }
    let url = format!("https://coverartarchive.org/release/{id}");
    match get_json::<CoverArt>(&url) {
        Ok(raw) => {
            let images = raw.images.unwrap_or_default();
            let front = images.iter().find(|img| img.front.unwrap_or(false));
            let pick = front.or_else(|| images.first());
            Ok(pick.and_then(|img| {
                img.thumbnails
                    .as_ref()
                    .and_then(|t| t.large.clone().or(t.small.clone()))
                    .or_else(|| img.image.clone())
            }))
        }
        Err(err) if err.code == "network" && err.message.contains("HTTP 404") => Ok(None),
        Err(err) => Err(err),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(search_releases("x", 3).is_err());
    }
}
