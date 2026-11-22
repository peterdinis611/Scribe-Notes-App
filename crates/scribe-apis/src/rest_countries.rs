//! REST Countries lookup.

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CountryInfo {
    pub name: String,
    pub official_name: Option<String>,
    pub cca2: Option<String>,
    pub cca3: Option<String>,
    pub capital: Vec<String>,
    pub region: Option<String>,
    pub subregion: Option<String>,
    pub currencies: Vec<String>,
    pub languages: Vec<String>,
    pub timezones: Vec<String>,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub flag_emoji: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CountryRaw {
    name: Option<NameRaw>,
    cca2: Option<String>,
    cca3: Option<String>,
    capital: Option<Vec<String>>,
    region: Option<String>,
    subregion: Option<String>,
    currencies: Option<std::collections::HashMap<String, CurrencyRaw>>,
    languages: Option<std::collections::HashMap<String, String>>,
    timezones: Option<Vec<String>>,
    latlng: Option<Vec<f64>>,
    flag: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NameRaw {
    common: Option<String>,
    official: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CurrencyRaw {
    name: Option<String>,
    symbol: Option<String>,
}

fn map_country(raw: CountryRaw) -> Option<CountryInfo> {
    let name = raw.name.as_ref()?.common.clone()?.trim().to_string();
    if name.is_empty() {
        return None;
    }
    let (lat, lng) = match raw.latlng.as_deref() {
        Some([a, b, ..]) => (Some(*a), Some(*b)),
        _ => (None, None),
    };
    let currencies = raw
        .currencies
        .unwrap_or_default()
        .into_iter()
        .map(|(code, meta)| {
            match (meta.name, meta.symbol) {
                (Some(n), Some(s)) => format!("{code} ({n}, {s})"),
                (Some(n), None) => format!("{code} ({n})"),
                _ => code,
            }
        })
        .collect();
    let languages = raw
        .languages
        .unwrap_or_default()
        .into_values()
        .collect();
    Some(CountryInfo {
        name,
        official_name: raw.name.and_then(|n| n.official),
        cca2: raw.cca2,
        cca3: raw.cca3,
        capital: raw.capital.unwrap_or_default(),
        region: raw.region,
        subregion: raw.subregion,
        currencies,
        languages,
        timezones: raw.timezones.unwrap_or_default(),
        lat,
        lng,
        flag_emoji: raw.flag,
    })
}

pub fn lookup_country(query: &str) -> ApiResult<Vec<CountryInfo>> {
    let q = query.trim();
    if q.len() < 2 {
        return Err(ApiError::invalid("query too short"));
    }
    let url = if q.len() == 2 || q.len() == 3 {
        format!(
            "https://restcountries.com/v3.1/alpha/{}",
            urlencoding::encode(&q.to_ascii_uppercase())
        )
    } else {
        format!(
            "https://restcountries.com/v3.1/name/{}?fields=name,cca2,cca3,capital,region,subregion,currencies,languages,timezones,latlng,flag",
            urlencoding::encode(q)
        )
    };
    // Alpha endpoint returns one object; name returns array — accept both via Value.
    let value: serde_json::Value = get_json(&url)?;
    let list: Vec<CountryRaw> = if value.is_array() {
        serde_json::from_value(value).map_err(|e| ApiError::parse(e.to_string()))?
    } else {
        let one: CountryRaw = serde_json::from_value(value).map_err(|e| ApiError::parse(e.to_string()))?;
        vec![one]
    };
    let out: Vec<_> = list.into_iter().filter_map(map_country).collect();
    if out.is_empty() {
        return Err(ApiError::not_found("no country match"));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_short() {
        assert!(lookup_country("x").is_err());
    }
}
