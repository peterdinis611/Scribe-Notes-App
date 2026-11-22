//! OSM Overpass API — nearby POIs (cafés, libraries, …).

use crate::error::{ApiError, ApiResult};
use crate::http::USER_AGENT;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverpassPoi {
    pub id: i64,
    pub name: String,
    pub kind: String,
    pub latitude: f64,
    pub longitude: f64,
    pub tags: Vec<(String, String)>,
}

const OVERPASS_URL: &str = "https://overpass-api.de/api/interpreter";

/// Common amenity presets: cafe, library, restaurant, pharmacy, hospital, bank, …
pub fn nearby_pois(
    lat: f64,
    lng: f64,
    radius_m: u32,
    amenities: &[String],
    limit: usize,
) -> ApiResult<Vec<OverpassPoi>> {
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lng) {
        return Err(ApiError::invalid("invalid coordinates"));
    }
    let radius = radius_m.clamp(50, 5000);
    let limit = limit.clamp(1, 40);
    let kinds: Vec<&str> = if amenities.is_empty() {
        vec!["cafe", "library", "restaurant", "pharmacy"]
    } else {
        amenities
            .iter()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty() && s.len() < 40 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
            .collect()
    };
    if kinds.is_empty() {
        return Err(ApiError::invalid("no valid amenity kinds"));
    }
    let mut filters = String::new();
    for kind in &kinds {
        filters.push_str(&format!(
            "node[\"amenity\"=\"{kind}\"](around:{radius},{lat},{lng});\n"
        ));
        filters.push_str(&format!(
            "way[\"amenity\"=\"{kind}\"](around:{radius},{lat},{lng});\n"
        ));
    }
    let query = format!(
        "[out:json][timeout:25];\n(\n{filters});\nout center {limit};"
    );
    let response = ureq::post(OVERPASS_URL)
        .set("User-Agent", USER_AGENT)
        .set("Content-Type", "application/x-www-form-urlencoded")
        .timeout(std::time::Duration::from_secs(30))
        .send_string(&format!("data={}", urlencoding::encode(&query)))
        .map_err(|err| ApiError::network(err.to_string()))?;
    let raw: Value = response
        .into_json()
        .map_err(|err| ApiError::parse(err.to_string()))?;
    let elements = raw
        .get("elements")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for el in elements {
        let id = el.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let tags = el.get("tags").cloned().unwrap_or(Value::Null);
        let name = tags
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if name.is_empty() {
            continue;
        }
        let kind = tags
            .get("amenity")
            .and_then(|v| v.as_str())
            .unwrap_or("poi")
            .to_string();
        let (latitude, longitude) = if let (Some(la), Some(lo)) = (
            el.get("lat").and_then(|v| v.as_f64()),
            el.get("lon").and_then(|v| v.as_f64()),
        ) {
            (la, lo)
        } else if let (Some(la), Some(lo)) = (
            el.pointer("/center/lat").and_then(|v| v.as_f64()),
            el.pointer("/center/lon").and_then(|v| v.as_f64()),
        ) {
            (la, lo)
        } else {
            continue;
        };
        let tag_pairs = tags
            .as_object()
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .take(12)
                    .collect()
            })
            .unwrap_or_default();
        out.push(OverpassPoi {
            id,
            name,
            kind,
            latitude,
            longitude,
            tags: tag_pairs,
        });
        if out.len() >= limit {
            break;
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_coords() {
        assert!(nearby_pois(999.0, 0.0, 500, &[], 5).is_err());
    }
}
