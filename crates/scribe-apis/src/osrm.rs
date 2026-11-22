//! OSRM public routing demo — driving/walking ETA between coordinates.

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteEta {
    pub profile: String,
    pub distance_m: f64,
    pub duration_sec: f64,
    pub geometry_polyline: Option<String>,
}

fn validate_coords(lat: f64, lng: f64) -> ApiResult<()> {
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lng) {
        return Err(ApiError::invalid("invalid coordinates"));
    }
    Ok(())
}

pub fn route(
    profile: &str,
    from_lat: f64,
    from_lng: f64,
    to_lat: f64,
    to_lng: f64,
) -> ApiResult<RouteEta> {
    validate_coords(from_lat, from_lng)?;
    validate_coords(to_lat, to_lng)?;
    let profile = match profile.trim().to_ascii_lowercase().as_str() {
        "walk" | "walking" | "foot" => "foot",
        "bike" | "cycling" | "bicycle" => "bike",
        _ => "driving",
    };
    // OSRM expects lon,lat
    let url = format!(
        "https://router.project-osrm.org/route/v1/{profile}/{from_lng},{from_lat};{to_lng},{to_lat}?overview=false&alternatives=false&steps=false"
    );
    let raw: Value = get_json(&url)?;
    let code = raw.get("code").and_then(|v| v.as_str()).unwrap_or("");
    if code != "Ok" {
        return Err(ApiError::network(format!("OSRM code: {code}")));
    }
    let route = raw
        .get("routes")
        .and_then(|v| v.as_array())
        .and_then(|a| a.first())
        .ok_or_else(|| ApiError::not_found("no route"))?;
    Ok(RouteEta {
        profile: profile.to_string(),
        distance_m: route.get("distance").and_then(|v| v.as_f64()).unwrap_or(0.0),
        duration_sec: route.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0),
        geometry_polyline: route
            .get("geometry")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_coords() {
        assert!(route("driving", 99.0, 0.0, 1.0, 1.0).is_err());
    }
}
