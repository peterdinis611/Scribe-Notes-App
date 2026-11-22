//! LibreTranslate — free translation via a public (or self-hosted) instance.

use crate::error::{ApiError, ApiResult};
use crate::http::post_json;
use serde::{Deserialize, Serialize};

/// Default public instance (no key required for light use).
pub const DEFAULT_INSTANCE: &str = "https://libretranslate.de";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Translation {
    pub translated_text: String,
    pub detected_language: Option<String>,
    pub source: String,
    pub target: String,
    pub instance: String,
}

#[derive(Debug, Serialize)]
struct TranslateBody<'a> {
    q: &'a str,
    source: &'a str,
    target: &'a str,
    format: &'a str,
}

#[derive(Debug, Deserialize)]
struct TranslateResponse {
    translated_text: Option<String>,
    detected_language: Option<DetectedLang>,
}

#[derive(Debug, Deserialize)]
struct DetectedLang {
    language: Option<String>,
}

fn normalize_instance(instance: Option<&str>) -> ApiResult<String> {
    let raw = instance.unwrap_or(DEFAULT_INSTANCE).trim().trim_end_matches('/');
    if raw.is_empty() {
        return Ok(DEFAULT_INSTANCE.to_string());
    }
    if !(raw.starts_with("https://") || raw.starts_with("http://")) {
        return Err(ApiError::invalid("instance must be http(s) URL"));
    }
    Ok(raw.to_string())
}

/// Translate `text` from `source` (`auto` allowed) to `target` (ISO 639-1).
pub fn translate(
    text: &str,
    source: Option<&str>,
    target: &str,
    instance: Option<&str>,
) -> ApiResult<Translation> {
    let text = text.trim();
    if text.is_empty() {
        return Err(ApiError::invalid("text empty"));
    }
    if text.len() > 8_000 {
        return Err(ApiError::invalid("text too long (max 8000 chars)"));
    }
    let target = target.trim().to_ascii_lowercase();
    if target.len() < 2 || target.len() > 8 {
        return Err(ApiError::invalid("invalid target language"));
    }
    let source = source
        .unwrap_or("auto")
        .trim()
        .to_ascii_lowercase();
    let source = if source.is_empty() {
        "auto".to_string()
    } else {
        source
    };
    let base = normalize_instance(instance)?;
    let url = format!("{base}/translate");
    let body = TranslateBody {
        q: text,
        source: &source,
        target: &target,
        format: "text",
    };
    let raw: TranslateResponse = post_json(&url, &body)?;
    let translated = raw
        .translated_text
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::parse("empty translation"))?;
    Ok(Translation {
        translated_text: translated,
        detected_language: raw
            .detected_language
            .and_then(|d| d.language)
            .filter(|s| !s.is_empty()),
        source,
        target,
        instance: base,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty() {
        assert!(translate(" ", None, "en", None).is_err());
    }

    #[test]
    fn rejects_bad_instance() {
        assert!(translate("hi", None, "en", Some("ftp://x")).is_err());
    }
}
