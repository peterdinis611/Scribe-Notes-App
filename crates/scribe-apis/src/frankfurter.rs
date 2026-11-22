//! Frankfurter FX rates (ECB data mirror, no key).

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FxRates {
    pub base: String,
    pub date: String,
    pub rates: HashMap<String, f64>,
}

#[derive(Debug, Deserialize)]
struct FrankfurterRaw {
    base: String,
    date: String,
    rates: HashMap<String, f64>,
}

pub fn latest_rates(base: &str, symbols: Option<&[String]>) -> ApiResult<FxRates> {
    let base = base.trim().to_ascii_uppercase();
    if base.len() != 3 {
        return Err(ApiError::invalid("base currency must be ISO 4217 (3 letters)"));
    }
    let mut url = format!("https://api.frankfurter.app/latest?from={base}");
    if let Some(syms) = symbols {
        let list: Vec<String> = syms
            .iter()
            .map(|s| s.trim().to_ascii_uppercase())
            .filter(|s| s.len() == 3)
            .collect();
        if !list.is_empty() {
            url.push_str(&format!("&to={}", list.join(",")));
        }
    }
    let raw: FrankfurterRaw = get_json(&url)?;
    Ok(FxRates {
        base: raw.base,
        date: raw.date,
        rates: raw.rates,
    })
}

pub fn convert(amount: f64, from: &str, to: &str) -> ApiResult<f64> {
    if !amount.is_finite() || amount < 0.0 {
        return Err(ApiError::invalid("amount must be a non-negative number"));
    }
    let to = to.trim().to_ascii_uppercase();
    let rates = latest_rates(from, Some(std::slice::from_ref(&to)))?;
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
    fn rejects_bad_base() {
        assert!(latest_rates("euro", None).is_err());
    }
}
