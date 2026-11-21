//! EU VIES VAT number validation via official SOAP checkVatService.

use crate::error::{ApiError, ApiResult};
use crate::http::USER_AGENT;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VatCheck {
    pub country_code: String,
    pub vat_number: String,
    pub valid: bool,
    pub name: Option<String>,
    pub address: Option<String>,
}

fn normalize_vat(country: &str, number: &str) -> ApiResult<(String, String)> {
    let mut cc = country.trim().to_ascii_uppercase();
    let mut num = number
        .trim()
        .to_ascii_uppercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>();
    if cc.is_empty() && num.len() >= 4 {
        cc = num.chars().take(2).collect();
        num = num.chars().skip(2).collect();
    }
    if cc.len() != 2 || !cc.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err(ApiError::invalid("country must be ISO 3166-1 alpha-2"));
    }
    if num.len() < 4 || num.len() > 20 {
        return Err(ApiError::invalid("invalid VAT number length"));
    }
    Ok((cc, num))
}

/// Extract text of the first XML element whose local name equals `local`.
fn xml_local_text(xml: &str, local: &str) -> Option<String> {
    let bare = format!("<{local}>");
    let ns = format!(":{local}>");
    let start = if let Some(i) = xml.find(&bare) {
        i + bare.len()
    } else if let Some(i) = xml.find(&ns) {
        i + ns.len()
    } else {
        return None;
    };
    let rest = &xml[start..];
    let close_bare = format!("</{local}>");
    if let Some(end) = rest.find(&close_bare) {
        return Some(rest[..end].trim().to_string());
    }
    let close_ns = format!(":{local}>");
    if let Some(end) = rest.find(&close_ns) {
        if let Some(slash) = rest[..end].rfind("</") {
            return Some(rest[..slash].trim().to_string());
        }
    }
    None
}

pub fn check_vat(country: &str, vat_number: &str) -> ApiResult<VatCheck> {
    let (country_code, vat_number) = normalize_vat(country, vat_number)?;
    let envelope = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:checkVat>
      <urn:countryCode>{country_code}</urn:countryCode>
      <urn:vatNumber>{vat_number}</urn:vatNumber>
    </urn:checkVat>
  </soapenv:Body>
</soapenv:Envelope>"#
    );
    let response = ureq::post("https://ec.europa.eu/taxation_customs/vies/services/checkVatService")
        .set("User-Agent", USER_AGENT)
        .set("Content-Type", "text/xml; charset=utf-8")
        .set("SOAPAction", "")
        .timeout(std::time::Duration::from_secs(20))
        .send_string(&envelope)
        .map_err(|err| ApiError::network(err.to_string()))?;
    let xml = response
        .into_string()
        .map_err(|err| ApiError::parse(err.to_string()))?;
    let valid_str = xml_local_text(&xml, "valid").ok_or_else(|| {
        ApiError::network("VIES response missing validity (service may be unavailable)")
    })?;
    let valid = valid_str.eq_ignore_ascii_case("true");
    let name = xml_local_text(&xml, "name").filter(|s| !s.is_empty() && s != "---");
    let address = xml_local_text(&xml, "address").filter(|s| !s.is_empty() && s != "---");
    Ok(VatCheck {
        country_code,
        vat_number,
        valid,
        name,
        address,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad() {
        assert!(check_vat("S", "123").is_err());
    }

    #[test]
    fn normalizes_full() {
        let (cc, num) = normalize_vat("", "SK2020264768").unwrap();
        assert_eq!(cc, "SK");
        assert_eq!(num, "2020264768");
    }

    #[test]
    fn parses_prefixed_xml() {
        let xml = r#"<ns2:valid>true</ns2:valid><ns2:name>ACME</ns2:name>"#;
        assert_eq!(xml_local_text(xml, "valid").as_deref(), Some("true"));
        assert_eq!(xml_local_text(xml, "name").as_deref(), Some("ACME"));
    }
}
