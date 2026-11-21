//! Open-Meteo forecast (no API key).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherSnapshot {
    pub latitude: f64,
    pub longitude: f64,
    pub timezone: String,
    pub temperature_c: Option<f64>,
    pub weather_code: Option<i64>,
    pub weather_label: String,
    pub wind_speed_kmh: Option<f64>,
    pub daily: Vec<WeatherDay>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherDay {
    pub date: String,
    pub temp_max_c: Option<f64>,
    pub temp_min_c: Option<f64>,
    pub weather_code: Option<i64>,
    pub weather_label: String,
    pub precipitation_mm: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct OpenMeteoResponse {
    latitude: f64,
    longitude: f64,
    timezone: Option<String>,
    current: Option<CurrentBlock>,
    daily: Option<DailyBlock>,
}

#[derive(Debug, Deserialize)]
struct CurrentBlock {
    temperature_2m: Option<f64>,
    weather_code: Option<i64>,
    wind_speed_10m: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct DailyBlock {
    time: Vec<String>,
    temperature_2m_max: Option<Vec<Option<f64>>>,
    temperature_2m_min: Option<Vec<Option<f64>>>,
    weather_code: Option<Vec<Option<i64>>>,
    precipitation_sum: Option<Vec<Option<f64>>>,
}

pub fn weather_label(code: Option<i64>) -> String {
    match code.unwrap_or(-1) {
        0 => "Clear".into(),
        1 | 2 => "Partly cloudy".into(),
        3 => "Overcast".into(),
        45 | 48 => "Fog".into(),
        51 | 53 | 55 => "Drizzle".into(),
        61 | 63 | 65 => "Rain".into(),
        71 | 73 | 75 => "Snow".into(),
        80..=82 => "Showers".into(),
        95 | 96 | 99 => "Thunderstorm".into(),
        _ => "Unknown".into(),
    }
}

pub fn forecast(lat: f64, lng: f64, days: usize) -> ApiResult<WeatherSnapshot> {
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lng) {
        return Err(ApiError::invalid("lat/lng out of range"));
    }
    let days = days.clamp(1, 7);
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}\
         &current=temperature_2m,weather_code,wind_speed_10m\
         &daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum\
         &forecast_days={days}&timezone=auto"
    );
    let raw: OpenMeteoResponse = get_json(&url)?;
    let code = raw.current.as_ref().and_then(|c| c.weather_code);
    let mut daily = Vec::new();
    if let Some(block) = raw.daily {
        for (i, date) in block.time.into_iter().enumerate() {
            let day_code = block
                .weather_code
                .as_ref()
                .and_then(|codes| codes.get(i).copied())
                .flatten();
            daily.push(WeatherDay {
                date,
                temp_max_c: block
                    .temperature_2m_max
                    .as_ref()
                    .and_then(|v| v.get(i).copied())
                    .flatten(),
                temp_min_c: block
                    .temperature_2m_min
                    .as_ref()
                    .and_then(|v| v.get(i).copied())
                    .flatten(),
                weather_code: day_code,
                weather_label: weather_label(day_code),
                precipitation_mm: block
                    .precipitation_sum
                    .as_ref()
                    .and_then(|v| v.get(i).copied())
                    .flatten(),
            });
        }
    }
    Ok(WeatherSnapshot {
        latitude: raw.latitude,
        longitude: raw.longitude,
        timezone: raw.timezone.unwrap_or_else(|| "UTC".into()),
        temperature_c: raw.current.as_ref().and_then(|c| c.temperature_2m),
        weather_code: code,
        weather_label: weather_label(code),
        wind_speed_kmh: raw.current.as_ref().and_then(|c| c.wind_speed_10m),
        daily,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_clear() {
        assert_eq!(weather_label(Some(0)), "Clear");
    }

    #[test]
    fn rejects_bad_coords() {
        assert!(forecast(200.0, 0.0, 3).is_err());
    }
}
