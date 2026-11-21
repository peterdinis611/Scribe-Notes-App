//! Metropolitan Museum of Art Collection API (no key).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetObject {
    pub object_id: i64,
    pub title: String,
    pub artist: Option<String>,
    pub date: Option<String>,
    pub medium: Option<String>,
    pub department: Option<String>,
    pub culture: Option<String>,
    pub primary_image_small: Option<String>,
    pub primary_image: Option<String>,
    pub object_url: Option<String>,
    pub is_public_domain: bool,
}

fn map_object(raw: &Value) -> Option<MetObject> {
    let object_id = raw.get("objectID")?.as_i64()?;
    let title = raw
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if title.is_empty() {
        return None;
    }
    Some(MetObject {
        object_id,
        title,
        artist: raw
            .get("artistDisplayName")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        date: raw
            .get("objectDate")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        medium: raw.get("medium").and_then(|v| v.as_str()).map(str::to_string),
        department: raw
            .get("department")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        culture: raw
            .get("culture")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        primary_image_small: raw
            .get("primaryImageSmall")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        primary_image: raw
            .get("primaryImage")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        object_url: raw
            .get("objectURL")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        is_public_domain: raw
            .get("isPublicDomain")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    })
}

pub fn search_objects(query: &str, limit: usize, public_domain_only: bool) -> ApiResult<Vec<MetObject>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 12);
    let mut url = format!(
        "https://collectionapi.metmuseum.org/public/collection/v1/search?q={}",
        urlencoding::encode(q)
    );
    if public_domain_only {
        url.push_str("&isPublicDomain=true");
    }
    let search: Value = get_json(&url)?;
    let ids = search
        .get("objectIDs")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for id_val in ids.into_iter().take(limit * 2) {
        if out.len() >= limit {
            break;
        }
        let Some(id) = id_val.as_i64() else { continue };
        let detail_url =
            format!("https://collectionapi.metmuseum.org/public/collection/v1/objects/{id}");
        let Ok(detail) = get_json::<Value>(&detail_url) else {
            continue;
        };
        if let Some(obj) = map_object(&detail) {
            if public_domain_only && !obj.is_public_domain {
                continue;
            }
            out.push(obj);
        }
    }
    Ok(out)
}

pub fn object_by_id(id: i64) -> ApiResult<MetObject> {
    if id <= 0 {
        return Err(ApiError::invalid("invalid object id"));
    }
    let url = format!("https://collectionapi.metmuseum.org/public/collection/v1/objects/{id}");
    let raw: Value = get_json(&url)?;
    map_object(&raw).ok_or_else(|| ApiError::not_found("object not found"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(search_objects("a", 3, true).is_err());
    }
}
