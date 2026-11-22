use crate::error::{ApiError, ApiResult};
use serde::de::DeserializeOwned;
use serde::Serialize;

pub const USER_AGENT: &str =
    "ScribeNotes/5.5.0 (desktop; local-first; https://github.com/peterdinis611/Scribe-Notes-App)";

const DEFAULT_TIMEOUT_SECS: u64 = 12;

fn map_ureq(err: ureq::Error) -> ApiError {
    match err {
        ureq::Error::Status(code, resp) => {
            let body = resp.into_string().unwrap_or_default();
            ApiError::network(format!(
                "HTTP {code}: {}",
                body.chars().take(200).collect::<String>()
            ))
        }
        other => ApiError::network(other.to_string()),
    }
}

pub fn get_json<T: DeserializeOwned>(url: &str) -> ApiResult<T> {
    get_json_with_headers(url, &[])
}

pub fn get_json_with_headers<T: DeserializeOwned>(
    url: &str,
    headers: &[(&str, &str)],
) -> ApiResult<T> {
    let mut request = ureq::get(url)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/json")
        .timeout(std::time::Duration::from_secs(DEFAULT_TIMEOUT_SECS));
    for (key, value) in headers {
        request = request.set(key, value);
    }
    let response = request.call().map_err(map_ureq)?;
    response
        .into_json()
        .map_err(|err| ApiError::parse(err.to_string()))
}

/// `application/x-www-form-urlencoded` POST → JSON body.
pub fn post_form_json<T: DeserializeOwned>(url: &str, form: &[(&str, &str)]) -> ApiResult<T> {
    let response = ureq::post(url)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/json")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .timeout(std::time::Duration::from_secs(DEFAULT_TIMEOUT_SECS))
        .send_form(form)
        .map_err(map_ureq)?;
    response
        .into_json()
        .map_err(|err| ApiError::parse(err.to_string()))
}

/// JSON POST → JSON body.
pub fn post_json<T: DeserializeOwned, B: Serialize>(url: &str, body: &B) -> ApiResult<T> {
    let response = ureq::post(url)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .timeout(std::time::Duration::from_secs(DEFAULT_TIMEOUT_SECS))
        .send_json(body)
        .map_err(map_ureq)?;
    response
        .into_json()
        .map_err(|err| ApiError::parse(err.to_string()))
}

