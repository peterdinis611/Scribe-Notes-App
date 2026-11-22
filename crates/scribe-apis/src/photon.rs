//! Photon (Komoot) geocoding — Nominatim-compatible, no API key.

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use crate::nominatim::GeocodeHit;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
struct PhotonResponse {
    features: Option<Vec<PhotonFeature>>,
}

#[derive(Debug, Deserialize)]
struct PhotonFeature {
    geometry: Option<PhotonGeometry>,
    properties: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct PhotonGeometry {
    coordinates: Option<Vec<f64>>,
}

pub fn geocode(query: &str, limit: usize) -> ApiResult<Vec<GeocodeHit>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 8);
    let url = format!(
        "https://photon.komoot.io/api/?limit={limit}&q={}",
        urlencoding::encode(q)
    );
    let raw: PhotonResponse = get_json(&url)?;
    Ok(raw
        .features
        .unwrap_or_default()
        .into_iter()
        .filter_map(|feat| {
            let coords = feat.geometry?.coordinates?;
            if coords.len() < 2 {
                return None;
            }
            let lng = coords[0];
            let lat = coords[1];
            let props = feat.properties.unwrap_or(Value::Null);
            let name = props
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            let city = props
                .get("city")
                .or_else(|| props.get("locality"))
                .and_then(|v| v.as_str());
            let country = props.get("country").and_then(|v| v.as_str());
            let street = props.get("street").and_then(|v| v.as_str());
            let mut parts = Vec::new();
            if !name.is_empty() {
                parts.push(name.to_string());
            }
            if let Some(s) = street {
                if !s.is_empty() && s != name {
                    parts.push(s.to_string());
                }
            }
            if let Some(c) = city {
                if !c.is_empty() {
                    parts.push(c.to_string());
                }
            }
            if let Some(c) = country {
                if !c.is_empty() {
                    parts.push(c.to_string());
                }
            }
            let display_name = if parts.is_empty() {
                format!("{lat:.5}, {lng:.5}")
            } else {
                parts.join(", ")
            };
            let osm_type = props
                .get("osm_type")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let osm_id = props.get("osm_id").and_then(|v| {
                v.as_i64()
                    .map(|n| n.to_string())
                    .or_else(|| v.as_str().map(str::to_string))
            });
            Some(GeocodeHit {
                display_name,
                lat,
                lng,
                place_id: osm_id.clone(),
                osm_type,
                osm_id,
                importance: None,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(geocode("a", 3).is_err());
    }
}
