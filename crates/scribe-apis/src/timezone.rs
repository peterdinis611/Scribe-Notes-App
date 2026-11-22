//! World Time API timezone lookup (worldtimeapi.org).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimezoneInfo {
    pub timezone: String,
    pub datetime: String,
    pub utc_offset: Option<String>,
    pub day_of_week: Option<i64>,
    pub day_of_year: Option<i64>,
    pub abbreviation: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WorldTimeRaw {
    timezone: Option<String>,
    datetime: Option<String>,
    utc_offset: Option<String>,
    day_of_week: Option<i64>,
    day_of_year: Option<i64>,
    abbreviation: Option<String>,
}

pub fn timezone_now(area: &str) -> ApiResult<TimezoneInfo> {
    let area = area.trim().trim_start_matches('/');
    if area.len() < 3 || !area.contains('/') {
        return Err(ApiError::invalid(
            "timezone must look like Area/Location (e.g. Europe/Bratislava)",
        ));
    }
    // Keep path segments encoded but preserve slashes.
    let encoded = area
        .split('/')
        .map(|part| urlencoding::encode(part).into_owned())
        .collect::<Vec<_>>()
        .join("/");
    let url = format!("https://worldtimeapi.org/api/timezone/{encoded}");
    let raw: WorldTimeRaw = get_json(&url)?;
    let timezone = raw
        .timezone
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::not_found("timezone missing"))?;
    let datetime = raw
        .datetime
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::not_found("datetime missing"))?;
    Ok(TimezoneInfo {
        timezone,
        datetime,
        utc_offset: raw.utc_offset,
        day_of_week: raw.day_of_week,
        day_of_year: raw.day_of_year,
        abbreviation: raw.abbreviation,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_area() {
        assert!(timezone_now("UTC").is_err());
    }
}
