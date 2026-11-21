//! OpenStreetMap Nominatim geocoding (usage policy: identify UA, 1 req/s).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeocodeHit {
    pub display_name: String,
    pub lat: f64,
    pub lng: f64,
    pub place_id: Option<String>,
    pub osm_type: Option<String>,
    pub osm_id: Option<String>,
    pub importance: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct NominatimRow {
    display_name: String,
    lat: String,
    lon: String,
    place_id: Option<u64>,
    osm_type: Option<String>,
    osm_id: Option<u64>,
    importance: Option<f64>,
}

pub fn geocode(query: &str, limit: usize) -> ApiResult<Vec<GeocodeHit>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 8);
    let url = format!(
        "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit={}&q={}",
        limit,
        urlencoding::encode(q)
    );
    let rows: Vec<NominatimRow> = get_json(&url)?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let lat = row.lat.parse().ok()?;
            let lng = row.lon.parse().ok()?;
            Some(GeocodeHit {
                display_name: row.display_name,
                lat,
                lng,
                place_id: row.place_id.map(|id| id.to_string()),
                osm_type: row.osm_type,
                osm_id: row.osm_id.map(|id| id.to_string()),
                importance: row.importance,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short_query() {
        assert!(geocode("a", 3).is_err());
    }

    #[test]
    fn parses_fixture_shape() {
        let raw = r#"[{"display_name":"Bratislava","lat":"48.15","lon":"17.11","place_id":1,"osm_type":"relation","osm_id":2,"importance":0.7}]"#;
        let rows: Vec<NominatimRow> = serde_json::from_str(raw).unwrap();
        assert_eq!(rows[0].display_name, "Bratislava");
    }
}
