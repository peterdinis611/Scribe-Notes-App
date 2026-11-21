use crate::error::{ApiError, ApiResult};
use serde::de::DeserializeOwned;

pub const USER_AGENT: &str =
    "ScribeNotes/5.4.0 (desktop; local-first; https://github.com/peterdinis611/Scribe-Notes-App)";

const DEFAULT_TIMEOUT_SECS: u64 = 12;

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
    let response = request.call().map_err(|err| match err {
        ureq::Error::Status(code, resp) => {
            let body = resp.into_string().unwrap_or_default();
            ApiError::network(format!("HTTP {code}: {}", body.chars().take(200).collect::<String>()))
        }
        other => ApiError::network(other.to_string()),
    })?;
    response
        .into_json()
        .map_err(|err| ApiError::parse(err.to_string()))
}

