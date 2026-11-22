//! LanguageTool public grammar check (rate-limited; no key for light use).

use crate::error::{ApiError, ApiResult};
use crate::http::post_form_json;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrammarMatch {
    pub message: String,
    pub short_message: Option<String>,
    pub offset: usize,
    pub length: usize,
    pub replacements: Vec<String>,
    pub rule_id: Option<String>,
    pub category: Option<String>,
    pub excerpt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrammarCheck {
    pub language: String,
    pub matches: Vec<GrammarMatch>,
}

#[derive(Debug, Deserialize)]
struct LtResponse {
    language: Option<LtLanguage>,
    matches: Option<Vec<LtMatch>>,
}

#[derive(Debug, Deserialize)]
struct LtLanguage {
    code: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LtMatch {
    message: Option<String>,
    short_message: Option<String>,
    offset: Option<usize>,
    length: Option<usize>,
    replacements: Option<Vec<LtReplacement>>,
    context: Option<LtContext>,
    rule: Option<LtRule>,
}

#[derive(Debug, Deserialize)]
struct LtReplacement {
    value: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LtContext {
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LtRule {
    id: Option<String>,
    category: Option<LtCategory>,
}

#[derive(Debug, Deserialize)]
struct LtCategory {
    name: Option<String>,
    id: Option<String>,
}

/// Check text with LanguageTool. `language` e.g. `en-US`, `sk-SK`, or `auto`.
pub fn check(text: &str, language: Option<&str>) -> ApiResult<GrammarCheck> {
    let text = text.trim();
    if text.is_empty() {
        return Err(ApiError::invalid("text empty"));
    }
    if text.len() > 20_000 {
        return Err(ApiError::invalid("text too long (max 20000 chars)"));
    }
    let lang = language.unwrap_or("auto").trim();
    let lang = if lang.is_empty() { "auto" } else { lang };
    let raw: LtResponse = post_form_json(
        "https://api.languagetool.org/v2/check",
        &[("text", text), ("language", lang)],
    )?;
    let language_label = raw
        .language
        .as_ref()
        .and_then(|l| l.name.clone().or_else(|| l.code.clone()))
        .unwrap_or_else(|| lang.to_string());
    let matches = raw
        .matches
        .unwrap_or_default()
        .into_iter()
        .filter_map(|m| {
            let message = m.message?.trim().to_string();
            if message.is_empty() {
                return None;
            }
            let offset = m.offset.unwrap_or(0);
            let length = m.length.unwrap_or(0);
            Some(GrammarMatch {
                message,
                short_message: m.short_message.filter(|s| !s.is_empty()),
                offset,
                length,
                replacements: m
                    .replacements
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|r| r.value.filter(|v| !v.is_empty()))
                    .take(5)
                    .collect(),
                rule_id: m.rule.as_ref().and_then(|r| r.id.clone()),
                category: m
                    .rule
                    .as_ref()
                    .and_then(|r| r.category.as_ref())
                    .and_then(|c| c.name.clone().or_else(|| c.id.clone())),
                excerpt: m.context.and_then(|c| c.text).filter(|s| !s.is_empty()),
            })
        })
        .collect();
    Ok(GrammarCheck {
        language: language_label,
        matches,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty() {
        assert!(check("  ", None).is_err());
    }
}
