//! NOAA CO-OPS tide predictions (stations in US/territories waters).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TideStation {
    pub id: String,
    pub name: String,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub state: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TidePrediction {
    pub time: String,
    pub height_ft: Option<f64>,
    pub typ: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TideForecast {
    pub station_id: String,
    pub predictions: Vec<TidePrediction>,
}

pub fn find_stations(query: &str, limit: usize) -> ApiResult<Vec<TideStation>> {
    let q = query.trim().to_lowercase();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let limit = limit.clamp(1, 20);
    let url = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions";
    let raw: Value = get_json(url)?;
    let stations = raw
        .get("stations")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(stations
        .into_iter()
        .filter_map(|s| {
            let id = s.get("id").and_then(|v| v.as_str())?.to_string();
            let name = s.get("name").and_then(|v| v.as_str())?.to_string();
            let state = s
                .get("state")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let hay = format!(
                "{} {} {}",
                name.to_lowercase(),
                state.as_deref().unwrap_or(""),
                id.to_lowercase()
            );
            if !hay.contains(&q) {
                return None;
            }
            Some(TideStation {
                id,
                name,
                latitude: s.get("lat").and_then(|v| v.as_f64()),
                longitude: s.get("lng").and_then(|v| v.as_f64()),
                state,
            })
        })
        .take(limit)
        .collect())
}

pub fn tide_predictions(station_id: &str, date: Option<&str>) -> ApiResult<TideForecast> {
    let station_id = station_id.trim();
    if station_id.is_empty() || station_id.len() > 16 {
        return Err(ApiError::invalid("invalid station id"));
    }
    let mut url = format!(
        "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&datum=MLLW&time_zone=lst_ldt&interval=hilo&units=english&format=json&station={}",
        urlencoding::encode(station_id)
    );
    if let Some(d) = date.map(str::trim).filter(|s| !s.is_empty()) {
        // YYYYMMDD
        let compact = d.replace('-', "");
        if compact.len() != 8 || !compact.chars().all(|c| c.is_ascii_digit()) {
            return Err(ApiError::invalid("date must be YYYY-MM-DD or YYYYMMDD"));
        }
        url.push_str(&format!("&begin_date={compact}&range=24"));
    } else {
        url.push_str("&date=today");
    }
    let raw: Value = get_json(&url)?;
    if let Some(err) = raw.get("error") {
        let msg = err
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("NOAA error");
        return Err(ApiError::network(msg.to_string()));
    }
    let predictions = raw
        .get("predictions")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|p| {
            let time = p.get("t").and_then(|v| v.as_str())?.to_string();
            let height_ft = p
                .get("v")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok());
            let typ = p.get("type").and_then(|v| v.as_str()).map(str::to_string);
            Some(TidePrediction {
                time,
                height_ft,
                typ,
            })
        })
        .collect();
    Ok(TideForecast {
        station_id: station_id.to_string(),
        predictions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(find_stations("x", 3).is_err());
    }

    #[test]
    fn rejects_empty_station() {
        assert!(tide_predictions("", None).is_err());
    }
}
