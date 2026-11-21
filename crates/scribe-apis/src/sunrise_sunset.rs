//! Sunrise-Sunset.org API (no key).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SunTimes {
    pub latitude: f64,
    pub longitude: f64,
    pub date: Option<String>,
    pub sunrise: String,
    pub sunset: String,
    pub solar_noon: Option<String>,
    pub day_length_sec: Option<i64>,
    pub civil_twilight_begin: Option<String>,
    pub civil_twilight_end: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SsResponse {
    status: Option<String>,
    results: Option<SsResults>,
}

#[derive(Debug, Deserialize)]
struct SsResults {
    sunrise: Option<String>,
    sunset: Option<String>,
    solar_noon: Option<String>,
    day_length: Option<serde_json::Value>,
    civil_twilight_begin: Option<String>,
    civil_twilight_end: Option<String>,
}

pub fn sun_times(lat: f64, lng: f64, date: Option<&str>) -> ApiResult<SunTimes> {
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lng) {
        return Err(ApiError::invalid("invalid coordinates"));
    }
    let mut url = format!(
        "https://api.sunrise-sunset.org/json?lat={lat}&lng={lng}&formatted=0"
    );
    if let Some(d) = date.map(str::trim).filter(|s| !s.is_empty()) {
        // YYYY-MM-DD
        if d.len() != 10 {
            return Err(ApiError::invalid("date must be YYYY-MM-DD"));
        }
        url.push_str(&format!("&date={}", urlencoding::encode(d)));
    }
    let raw: SsResponse = get_json(&url)?;
    if raw.status.as_deref() != Some("OK") {
        return Err(ApiError::network(format!(
            "sunrise-sunset status: {:?}",
            raw.status
        )));
    }
    let results = raw
        .results
        .ok_or_else(|| ApiError::not_found("no sun times"))?;
    let sunrise = results
        .sunrise
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::not_found("missing sunrise"))?;
    let sunset = results
        .sunset
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::not_found("missing sunset"))?;
    let day_length_sec = results.day_length.and_then(|v| {
        v.as_i64()
            .or_else(|| v.as_f64().map(|f| f as i64))
            .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    });
    Ok(SunTimes {
        latitude: lat,
        longitude: lng,
        date: date.map(|s| s.to_string()),
        sunrise,
        sunset,
        solar_noon: results.solar_noon,
        day_length_sec,
        civil_twilight_begin: results.civil_twilight_begin,
        civil_twilight_end: results.civil_twilight_end,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_coords() {
        assert!(sun_times(91.0, 0.0, None).is_err());
    }
}
