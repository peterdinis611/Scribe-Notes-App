//! Internet Archive Wayback Machine availability / closest snapshot.

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaybackSnapshot {
    pub url: String,
    pub archived_url: String,
    pub timestamp: String,
    pub available: bool,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AvailabilityRaw {
    archived_snapshots: Option<ArchivedSnapshots>,
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ArchivedSnapshots {
    closest: Option<ClosestSnap>,
}

#[derive(Debug, Deserialize)]
struct ClosestSnap {
    available: Option<bool>,
    url: Option<String>,
    timestamp: Option<String>,
    status: Option<String>,
}

pub fn wayback_closest(url: &str) -> ApiResult<WaybackSnapshot> {
    let url = url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(ApiError::invalid("url must be http(s)"));
    }
    let api = format!(
        "https://archive.org/wayback/available?url={}",
        urlencoding::encode(url)
    );
    let raw: AvailabilityRaw = get_json(&api)?;
    let closest = raw
        .archived_snapshots
        .and_then(|s| s.closest)
        .ok_or_else(|| ApiError::not_found("no Wayback snapshot"))?;
    let archived_url = closest
        .url
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::not_found("no Wayback snapshot URL"))?;
    Ok(WaybackSnapshot {
        url: raw.url.unwrap_or_else(|| url.to_string()),
        archived_url,
        timestamp: closest.timestamp.unwrap_or_default(),
        available: closest.available.unwrap_or(true),
        status: closest.status,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_url() {
        assert!(wayback_closest("example.com").is_err());
    }
}
