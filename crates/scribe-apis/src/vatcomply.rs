//! VATComply — EU VAT number check (no API key) + standard rate table.

use crate::error::{ApiError, ApiResult};
use crate::http::get_json;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VatRateInfo {
    pub country_code: String,
    pub standard_rate: Option<f64>,
    pub currency: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VatNumberInfo {
    pub country_code: String,
    pub vat_number: String,
    pub valid: bool,
    pub name: Option<String>,
    pub address: Option<String>,
}

fn country_from_vat(vat: &str) -> ApiResult<(String, String)> {
    let cleaned = vat
        .trim()
        .to_ascii_uppercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>();
    if cleaned.len() < 4 {
        return Err(ApiError::invalid("VAT number too short"));
    }
    let cc: String = cleaned.chars().take(2).collect();
    if !cc.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err(ApiError::invalid("VAT must start with country code"));
    }
    let num: String = cleaned.chars().skip(2).collect();
    Ok((cc, num))
}

/// Standard VAT rate for an ISO country code (e.g. `SK`).
/// Rates are embedded (EU schedule) — VATComply's public `/rates` is FX-only.
pub fn vat_rate(country: &str) -> ApiResult<VatRateInfo> {
    let cc = country.trim().to_ascii_uppercase();
    if cc.len() != 2 {
        return Err(ApiError::invalid("country must be ISO alpha-2"));
    }
    let (rate, name, currency) = match cc.as_str() {
        "AT" => (20.0, "Austria", "EUR"),
        "BE" => (21.0, "Belgium", "EUR"),
        "BG" => (20.0, "Bulgaria", "BGN"),
        "HR" => (25.0, "Croatia", "EUR"),
        "CY" => (19.0, "Cyprus", "EUR"),
        "CZ" => (21.0, "Czechia", "CZK"),
        "DK" => (25.0, "Denmark", "DKK"),
        "EE" => (22.0, "Estonia", "EUR"),
        "FI" => (25.5, "Finland", "EUR"),
        "FR" => (20.0, "France", "EUR"),
        "DE" => (19.0, "Germany", "EUR"),
        "GR" => (24.0, "Greece", "EUR"),
        "HU" => (27.0, "Hungary", "HUF"),
        "IE" => (23.0, "Ireland", "EUR"),
        "IT" => (22.0, "Italy", "EUR"),
        "LV" => (21.0, "Latvia", "EUR"),
        "LT" => (21.0, "Lithuania", "EUR"),
        "LU" => (17.0, "Luxembourg", "EUR"),
        "MT" => (18.0, "Malta", "EUR"),
        "NL" => (21.0, "Netherlands", "EUR"),
        "PL" => (23.0, "Poland", "PLN"),
        "PT" => (23.0, "Portugal", "EUR"),
        "RO" => (19.0, "Romania", "RON"),
        "SK" => (23.0, "Slovakia", "EUR"),
        "SI" => (22.0, "Slovenia", "EUR"),
        "ES" => (21.0, "Spain", "EUR"),
        "SE" => (25.0, "Sweden", "SEK"),
        _ => return Err(ApiError::not_found(format!("no VAT rate for {cc}"))),
    };
    Ok(VatRateInfo {
        country_code: cc,
        standard_rate: Some(rate),
        currency: Some(currency.into()),
        name: Some(name.into()),
    })
}

/// Validate a VAT number via VATComply (complements VIES).
pub fn check_vat_number(vat_number: &str) -> ApiResult<VatNumberInfo> {
    let (country_code, number) = country_from_vat(vat_number)?;
    let full = format!("{country_code}{number}");
    let url = format!(
        "https://api.vatcomply.com/vat?vat_number={}",
        urlencoding::encode(&full)
    );
    let raw: Value = get_json(&url)?;
    let valid = raw
        .get("valid")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    Ok(VatNumberInfo {
        country_code: raw
            .get("country_code")
            .and_then(|v| v.as_str())
            .unwrap_or(&country_code)
            .to_string(),
        vat_number: raw
            .get("vat_number")
            .and_then(|v| v.as_str())
            .unwrap_or(&number)
            .to_string(),
        valid,
        name: raw
            .get("name")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty() && *s != "---")
            .map(str::to_string),
        address: raw
            .get("address")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty() && *s != "---")
            .map(str::to_string),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_vat() {
        let (cc, num) = country_from_vat("SK2020264768").unwrap();
        assert_eq!(cc, "SK");
        assert_eq!(num, "2020264768");
    }

    #[test]
    fn sk_rate() {
        let info = vat_rate("SK").unwrap();
        assert_eq!(info.standard_rate, Some(23.0));
    }
}
