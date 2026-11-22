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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AirQualitySnapshot {
    pub latitude: f64,
    pub longitude: f64,
    pub timezone: String,
    pub european_aqi: Option<f64>,
    pub us_aqi: Option<f64>,
    pub pm10: Option<f64>,
    #[serde(rename = "pm25")]
    pub pm2_5: Option<f64>,
    pub carbon_monoxide: Option<f64>,
    pub nitrogen_dioxide: Option<f64>,
    pub sulphur_dioxide: Option<f64>,
    pub ozone: Option<f64>,
    pub aqi_label: String,
}

#[derive(Debug, Deserialize)]
struct AirQualityResponse {
    latitude: f64,
    longitude: f64,
    timezone: Option<String>,
    current: Option<AirCurrentBlock>,
}

#[derive(Debug, Deserialize)]
struct AirCurrentBlock {
    european_aqi: Option<f64>,
    us_aqi: Option<f64>,
    pm10: Option<f64>,
    pm2_5: Option<f64>,
    carbon_monoxide: Option<f64>,
    nitrogen_dioxide: Option<f64>,
    sulphur_dioxide: Option<f64>,
    ozone: Option<f64>,
}

pub fn aqi_label(european_aqi: Option<f64>) -> String {
    match european_aqi.map(|v| v.round() as i64).unwrap_or(-1) {
        0..=20 => "Good".into(),
        21..=40 => "Fair".into(),
        41..=60 => "Moderate".into(),
        61..=80 => "Poor".into(),
        81..=100 => "Very poor".into(),
        n if n > 100 => "Extremely poor".into(),
        _ => "Unknown".into(),
    }
}

pub fn air_quality(lat: f64, lng: f64) -> ApiResult<AirQualitySnapshot> {
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lng) {
        return Err(ApiError::invalid("lat/lng out of range"));
    }
    let url = format!(
        "https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lng}\
         &current=european_aqi,us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone\
         &timezone=auto"
    );
    let raw: AirQualityResponse = get_json(&url)?;
    let current = raw.current;
    let european_aqi = current.as_ref().and_then(|c| c.european_aqi);
    Ok(AirQualitySnapshot {
        latitude: raw.latitude,
        longitude: raw.longitude,
        timezone: raw.timezone.unwrap_or_else(|| "UTC".into()),
        european_aqi,
        us_aqi: current.as_ref().and_then(|c| c.us_aqi),
        pm10: current.as_ref().and_then(|c| c.pm10),
        pm2_5: current.as_ref().and_then(|c| c.pm2_5),
        carbon_monoxide: current.as_ref().and_then(|c| c.carbon_monoxide),
        nitrogen_dioxide: current.as_ref().and_then(|c| c.nitrogen_dioxide),
        sulphur_dioxide: current.as_ref().and_then(|c| c.sulphur_dioxide),
        ozone: current.as_ref().and_then(|c| c.ozone),
        aqi_label: aqi_label(european_aqi),
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

    #[test]
    fn aqi_good() {
        assert_eq!(aqi_label(Some(12.0)), "Good");
    }

    #[test]
    fn aq_rejects_bad_coords() {
        assert!(air_quality(200.0, 0.0).is_err());
    }
}
