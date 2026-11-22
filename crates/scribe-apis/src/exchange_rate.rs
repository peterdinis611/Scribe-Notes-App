//! FX backups: open.er-api.com + ECB SDMX JSON (Frankfurter primary).

use crate::error::{ApiError, ApiResult};
use crate::frankfurter::{latest_rates as frankfurter_latest, FxRates};
use crate::http::get_json;
use serde_json::Value;
use std::collections::HashMap;

fn normalize_currency(code: &str) -> ApiResult<String> {
    let c = code.trim().to_ascii_uppercase();
    if c.len() != 3 || !c.chars().all(|ch| ch.is_ascii_alphabetic()) {
        return Err(ApiError::invalid("currency must be ISO 4217 (3 letters)"));
    }
    Ok(c)
}

/// open.er-api.com free endpoint (ExchangeRate-API open access).
pub fn open_er_api_latest(base: &str) -> ApiResult<FxRates> {
    let base = normalize_currency(base)?;
    let url = format!("https://open.er-api.com/v6/latest/{base}");
    let raw: Value = get_json(&url)?;
    let result = raw.get("result").and_then(|v| v.as_str()).unwrap_or("");
    if result != "success" {
        return Err(ApiError::network(format!("open.er-api result: {result}")));
    }
    let rates_obj = raw
        .get("rates")
        .and_then(|v| v.as_object())
        .ok_or_else(|| ApiError::parse("missing rates"))?;
    let mut rates = HashMap::new();
    for (k, v) in rates_obj {
        if let Some(n) = v.as_f64() {
            rates.insert(k.to_ascii_uppercase(), n);
        }
    }
    Ok(FxRates {
        base,
        date: raw
            .get("time_last_update_utc")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        rates,
    })
}

/// ECB Statistical Data Warehouse — daily EUR reference rates (SDMX-JSON).
pub fn ecb_eur_latest() -> ApiResult<FxRates> {
    let url = "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?lastNObservations=1&format=jsondata";
    let raw: Value = get_json(url)?;
    let series = raw
        .pointer("/dataSets/0/series")
        .and_then(|v| v.as_object())
        .ok_or_else(|| ApiError::parse("ECB missing series"))?;
    let dimensions = raw
        .pointer("/structure/dimensions/series")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let currency_dim = dimensions.iter().enumerate().find(|(_, d)| {
        d.get("id")
            .and_then(|v| v.as_str())
            .map(|s| s == "CURRENCY")
            .unwrap_or(false)
    });
    let mut rates = HashMap::new();
    rates.insert("EUR".to_string(), 1.0);
    let Some((curr_idx, dim)) = currency_dim else {
        return Err(ApiError::parse("could not parse ECB currency dimension"));
    };
    let values = dim
        .get("values")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    for (key, serie) in series {
        let parts: Vec<&str> = key.split(':').collect();
        let Some(code) = parts
            .get(curr_idx)
            .and_then(|i| i.parse::<usize>().ok())
            .and_then(|i| values.get(i))
            .and_then(|v| v.get("id"))
            .and_then(|v| v.as_str())
        else {
            continue;
        };
        let obs = serie
            .get("observations")
            .and_then(|v| v.as_object())
            .and_then(|o| o.values().next())
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|v| v.as_f64());
        if let Some(rate) = obs {
            rates.insert(code.to_ascii_uppercase(), rate);
        }
    }
    if rates.len() <= 1 {
        return Err(ApiError::parse("ECB returned no currency rates"));
    }
    let date = raw
        .pointer("/structure/dimensions/observation/0/values/0/id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(FxRates {
        base: "EUR".into(),
        date,
        rates,
    })
}

/// Prefer Frankfurter; fall back to open.er-api, then ECB (EUR only).
pub fn latest_with_fallback(base: &str, symbols: Option<&[String]>) -> ApiResult<FxRates> {
    let base_norm = normalize_currency(base)?;
    match frankfurter_latest(&base_norm, symbols) {
        Ok(rates) => Ok(rates),
        Err(frank_err) => match open_er_api_latest(&base_norm) {
            Ok(mut rates) => {
                if let Some(syms) = symbols {
                    let want: Vec<String> = syms
                        .iter()
                        .map(|s| s.trim().to_ascii_uppercase())
                        .filter(|s| s.len() == 3)
                        .collect();
                    if !want.is_empty() {
                        rates.rates.retain(|k, _| want.contains(k));
                    }
                }
                Ok(rates)
            }
            Err(er_err) if base_norm == "EUR" => {
                let mut rates = ecb_eur_latest().map_err(|ecb_err| {
                    ApiError::network(format!(
                        "FX fallbacks failed: frankfurter={}; er-api={}; ecb={}",
                        frank_err.message, er_err.message, ecb_err.message
                    ))
                })?;
                if let Some(syms) = symbols {
                    let want: Vec<String> = syms
                        .iter()
                        .map(|s| s.trim().to_ascii_uppercase())
                        .filter(|s| s.len() == 3)
                        .collect();
                    if !want.is_empty() {
                        rates.rates.retain(|k, _| want.contains(k) || k == "EUR");
                    }
                }
                Ok(rates)
            }
            Err(er_err) => Err(ApiError::network(format!(
                "FX fallbacks failed: frankfurter={}; er-api={}",
                frank_err.message, er_err.message
            ))),
        },
    }
}

pub fn convert_with_fallback(amount: f64, from: &str, to: &str) -> ApiResult<f64> {
    if !amount.is_finite() || amount < 0.0 {
        return Err(ApiError::invalid("amount must be a non-negative finite number"));
    }
    let from = normalize_currency(from)?;
    let to = normalize_currency(to)?;
    if from == to {
        return Ok(amount);
    }
    let rates = latest_with_fallback(&from, Some(std::slice::from_ref(&to)))?;
    let rate = rates
        .rates
        .get(&to)
        .copied()
        .ok_or_else(|| ApiError::not_found(format!("no rate for {to}")))?;
    Ok(amount * rate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_currency() {
        assert!(open_er_api_latest("EU").is_err());
    }

    #[test]
    fn convert_same_currency() {
        assert!((convert_with_fallback(10.0, "EUR", "eur").unwrap() - 10.0).abs() < f64::EPSILON);
    }
}
