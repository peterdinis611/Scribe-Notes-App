//! Nager.Date — public holidays (no key).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicHoliday {
    pub date: String,
    pub local_name: String,
    pub name: String,
    pub country_code: String,
    pub fixed: bool,
    pub global: bool,
    pub types: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct NagerHoliday {
    date: Option<String>,
    #[serde(rename = "localName")]
    local_name: Option<String>,
    name: Option<String>,
    #[serde(rename = "countryCode")]
    country_code: Option<String>,
    fixed: Option<bool>,
    global: Option<bool>,
    types: Option<Vec<String>>,
}

fn normalize_country(code: &str) -> ApiResult<String> {
    let c = code.trim().to_ascii_uppercase();
    if c.len() != 2 || !c.chars().all(|ch| ch.is_ascii_alphabetic()) {
        return Err(ApiError::invalid("country must be ISO 3166-1 alpha-2"));
    }
    Ok(c)
}

pub fn public_holidays(year: i32, country: &str) -> ApiResult<Vec<PublicHoliday>> {
    if !(1970..=2100).contains(&year) {
        return Err(ApiError::invalid("year out of range"));
    }
    let country = normalize_country(country)?;
    let url = format!("https://date.nager.at/api/v3/PublicHolidays/{year}/{country}");
    let raw: Vec<NagerHoliday> = get_json(&url)?;
    Ok(raw
        .into_iter()
        .filter_map(|h| {
            let date = h.date?.trim().to_string();
            if date.is_empty() {
                return None;
            }
            Some(PublicHoliday {
                date,
                local_name: h.local_name.unwrap_or_default(),
                name: h.name.unwrap_or_default(),
                country_code: h.country_code.unwrap_or_else(|| country.clone()),
                fixed: h.fixed.unwrap_or(false),
                global: h.global.unwrap_or(true),
                types: h.types.unwrap_or_default(),
            })
        })
        .collect())
}

pub fn is_today_holiday(country: &str, today: &str) -> ApiResult<Option<PublicHoliday>> {
    let today = today.trim();
    if today.len() < 10 {
        return Err(ApiError::invalid("today must be YYYY-MM-DD"));
    }
    let year: i32 = today[..4]
        .parse()
        .map_err(|_| ApiError::invalid("invalid year in date"))?;
    let holidays = public_holidays(year, country)?;
    Ok(holidays.into_iter().find(|h| h.date == today || h.date.starts_with(today)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_country() {
        assert!(public_holidays(2026, "SVK").is_err());
    }
}
