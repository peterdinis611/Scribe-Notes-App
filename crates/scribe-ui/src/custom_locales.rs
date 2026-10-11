//! Custom language packs: parse / validate / normalize (`src/lib/i18n/custom-locales.ts`).
//!
//! DOM / file-picker / storage concerns stay in the frontend.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use thiserror::Error;

use crate::error::UiError;
use crate::locale_options::BUILT_IN_LOCALES;

/// Max accepted JSON text length (UTF-16 code units, as in JS `String.length`).
pub const MAX_LOCALE_JSON_CHARS: usize = 2_500_000;
pub const MAX_LOCALE_CODE_LEN: usize = 16;
pub const MAX_LOCALE_NAME_LEN: usize = 64;
pub const MIN_TRANSLATION_LEAVES: usize = 3;
const MAX_LEAF_DEPTH: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CustomLocalePack {
    pub code: String,
    pub name: String,
    pub messages: Map<String, Value>,
}

/// Fallbacks (typically derived from the file name) used when the JSON lacks code / name.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParseLocaleOptions {
    #[serde(default)]
    pub fallback_code: Option<String>,
    #[serde(default)]
    pub fallback_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum CustomLocaleError {
    #[error("Language file is too large (max ~2.5 MB)")]
    TooLarge,
    #[error("Invalid JSON")]
    InvalidJson,
    #[error("Language JSON must be an object")]
    NotObject,
    #[error("Missing or invalid language code (e.g. \"de\", \"cs\", \"pl\")")]
    InvalidCode,
    #[error("Cannot replace built-in language \"{0}\". Use a different code.")]
    BuiltInCode(String),
    #[error("Language file has too few translation strings")]
    TooFewStrings,
}

impl From<CustomLocaleError> for UiError {
    fn from(value: CustomLocaleError) -> Self {
        UiError::Message(value.to_string())
    }
}

/// Lowercase, strip everything except `[a-z0-9_-]`, cap at 16 chars.
pub fn normalize_locale_code(raw: &str) -> String {
    raw.trim()
        .to_lowercase()
        .chars()
        .filter(|c| matches!(c, 'a'..='z' | '0'..='9' | '_' | '-'))
        .take(MAX_LOCALE_CODE_LEN)
        .collect()
}

pub fn is_built_in_locale_code(code: &str) -> bool {
    BUILT_IN_LOCALES.contains(&code)
}

/// `^[a-z][a-z0-9_-]{0,15}$`
pub fn is_valid_locale_code(code: &str) -> bool {
    let mut chars = code.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    first.is_ascii_lowercase()
        && code.len() <= MAX_LOCALE_CODE_LEN
        && chars.all(|c| matches!(c, 'a'..='z' | '0'..='9' | '_' | '-'))
}

/// Number of string leaves in nested objects (arrays and depth > 12 are ignored).
pub fn count_leaves(value: &Value) -> usize {
    fn walk(value: &Value, depth: usize) -> usize {
        if depth > MAX_LEAF_DEPTH {
            return 0;
        }
        match value {
            Value::Object(map) => map.values().map(|v| walk(v, depth + 1)).sum(),
            Value::String(_) => 1,
            _ => 0,
        }
    }
    walk(value, 0)
}

/// JS `String(value)` for JSON values (used on loosely typed `code` / `name` fields).
fn js_string(value: &Value) -> String {
    match value {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => match n.as_f64() {
            Some(f) if f.fract() == 0.0 && f.abs() < 1e21 => format!("{}", f as i128),
            _ => n.to_string(),
        },
        Value::String(s) => s.clone(),
        Value::Array(items) => items
            .iter()
            .map(|v| if v.is_null() { String::new() } else { js_string(v) })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".into(),
    }
}

/// First non-null value among `keys` (JS `a ?? b ?? c`), stringified; `""` when none.
fn first_string(map: &Map<String, Value>, keys: &[&str]) -> String {
    keys.iter()
        .filter_map(|k| map.get(*k))
        .find(|v| !v.is_null())
        .map(js_string)
        .unwrap_or_default()
}

/// Slice by UTF-16 code units (JS `slice(0, n)`), without splitting a scalar value.
fn slice_utf16(s: &str, max_units: usize) -> String {
    let mut units = 0;
    let mut out = String::new();
    for c in s.chars() {
        units += c.len_utf16();
        if units > max_units {
            break;
        }
        out.push(c);
    }
    out
}

fn has_object(map: &Map<String, Value>, key: &str) -> bool {
    map.get(key).is_some_and(Value::is_object)
}

/// Accepts a wrapped pack (`{ code, name, messages }`) or a bare messages tree.
pub fn parse_custom_locale_pack(
    raw: &str,
    options: &ParseLocaleOptions,
) -> Result<CustomLocalePack, CustomLocaleError> {
    if raw.encode_utf16().count() > MAX_LOCALE_JSON_CHARS {
        return Err(CustomLocaleError::TooLarge);
    }
    let parsed: Value = serde_json::from_str(raw).map_err(|_| CustomLocaleError::InvalidJson)?;
    let Value::Object(root) = parsed else {
        return Err(CustomLocaleError::NotObject);
    };

    let fallback_code = options.fallback_code.as_deref().unwrap_or("");
    let fallback_name = options.fallback_name.as_deref().unwrap_or("");

    let (code_raw, name_raw, messages): (String, String, Value) =
        if has_object(&root, "messages") || has_object(&root, "translation") {
            // `parsed.messages ?? parsed.translation` — a non-object `messages` wins over
            // an object `translation` and later fails the leaf-count check.
            let messages = ["messages", "translation"]
                .iter()
                .filter_map(|k| root.get(*k))
                .find(|v| !v.is_null())
                .cloned()
                .unwrap_or(Value::Null);
            (
                first_string(&root, &["code", "locale", "lang"]),
                first_string(&root, &["name", "label", "title"]),
                messages,
            )
        } else if has_object(&root, "settings") || has_object(&root, "common") || has_object(&root, "toolbar") {
            // Real catalog: top-level `code` / `name` are translation keys, not metadata.
            (fallback_code.to_string(), fallback_name.to_string(), Value::Object(root.clone()))
        } else {
            (
                first_string(&root, &["code"]),
                first_string(&root, &["name"]),
                Value::Object(root.clone()),
            )
        };

    let code_source = if code_raw.is_empty() { fallback_code } else { code_raw.as_str() };
    let code = normalize_locale_code(code_source);
    if code.is_empty() || !is_valid_locale_code(&code) {
        return Err(CustomLocaleError::InvalidCode);
    }
    if is_built_in_locale_code(&code) {
        return Err(CustomLocaleError::BuiltInCode(code));
    }

    if count_leaves(&messages) < MIN_TRANSLATION_LEAVES {
        return Err(CustomLocaleError::TooFewStrings);
    }
    let Value::Object(messages) = messages else {
        return Err(CustomLocaleError::TooFewStrings);
    };

    let mut name = slice_utf16(name_raw.trim(), MAX_LOCALE_NAME_LEN);
    if name.is_empty() {
        name = slice_utf16(fallback_name.trim(), MAX_LOCALE_NAME_LEN);
    }
    if name.is_empty() {
        name = code.to_uppercase();
    }

    Ok(CustomLocalePack { code, name, messages })
}

/// Pretty JSON (2 spaces) with `code`, `name`, `messages` and a trailing newline.
pub fn serialize_custom_locale_pack(pack: &CustomLocalePack) -> String {
    let mut text = serde_json::to_string_pretty(pack).unwrap_or_else(|_| "{}".into());
    text.push('\n');
    text
}

fn matches_locale_suffix(rest: &[char]) -> bool {
    let alpha = |c: &char| c.is_ascii_alphabetic();
    match rest.len() {
        2 => rest.iter().all(alpha),
        5 => rest[..2].iter().all(alpha) && rest[2] == '-' && rest[3..].iter().all(alpha),
        _ => false,
    }
}

/// Guess a language code from a file name like `app.de.json`, `pack_cs.json`, `pl.json`.
pub fn guess_code_from_file_name(file_name: &str) -> Option<String> {
    // Strip the last `.ext` (`/\.[^.]+$/`).
    let base = match file_name.rfind('.') {
        Some(i) if i + 1 < file_name.len() => &file_name[..i],
        _ => file_name,
    }
    .trim();
    let chars: Vec<char> = base.chars().collect();

    // `(?:^|[._-])([a-z]{2}(?:-[a-z]{2})?)$`, leftmost match first.
    for start in 0..=chars.len() {
        let mut candidates = Vec::with_capacity(2);
        if start == 0 {
            candidates.push(0);
        }
        if matches!(chars.get(start), Some('.' | '_' | '-')) {
            candidates.push(start + 1);
        }
        for group in candidates {
            if group <= chars.len() && matches_locale_suffix(&chars[group..]) {
                return Some(normalize_locale_code(&chars[group..].iter().collect::<String>()));
            }
        }
    }

    let normalized = normalize_locale_code(base);
    if !normalized.is_empty() && is_valid_locale_code(&normalized) {
        Some(normalized)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn opts() -> ParseLocaleOptions {
        ParseLocaleOptions::default()
    }

    #[test]
    fn normalizes_codes() {
        assert_eq!(normalize_locale_code("  De-CH! "), "de-ch");
        assert_eq!(normalize_locale_code("abcdefghijklmnopqrstuvwxyz"), "abcdefghijklmnop");
        assert!(is_valid_locale_code("pt-br"));
        assert!(!is_valid_locale_code("1de"));
        assert!(!is_valid_locale_code(""));
        assert!(is_built_in_locale_code("sk"));
        assert!(!is_built_in_locale_code("de"));
    }

    #[test]
    fn parses_wrapped_pack() {
        let raw = json!({
            "code": "DE", "name": "  Deutsch ",
            "messages": { "a": "1", "b": { "c": "2", "d": "3" } }
        })
        .to_string();
        let pack = parse_custom_locale_pack(&raw, &opts()).unwrap();
        assert_eq!(pack.code, "de");
        assert_eq!(pack.name, "Deutsch");
        assert_eq!(count_leaves(&Value::Object(pack.messages.clone())), 3);
    }

    #[test]
    fn accepts_aliases() {
        let raw = json!({
            "locale": "cs", "label": "Čeština",
            "translation": { "a": "1", "b": "2", "c": "3" }
        })
        .to_string();
        let pack = parse_custom_locale_pack(&raw, &opts()).unwrap();
        assert_eq!((pack.code.as_str(), pack.name.as_str()), ("cs", "Čeština"));
    }

    #[test]
    fn parses_bare_tree_with_fallbacks() {
        let raw = json!({ "a": "1", "b": "2", "c": "3" }).to_string();
        let o = ParseLocaleOptions { fallback_code: Some("pl".into()), fallback_name: Some("Polski".into()) };
        let pack = parse_custom_locale_pack(&raw, &o).unwrap();
        assert_eq!((pack.code.as_str(), pack.name.as_str()), ("pl", "Polski"));
        assert_eq!(pack.messages.len(), 3);

        // No name anywhere → upper-cased code.
        let o = ParseLocaleOptions { fallback_code: Some("pl".into()), fallback_name: None };
        assert_eq!(parse_custom_locale_pack(&raw, &o).unwrap().name, "PL");
    }

    #[test]
    fn bare_tree_with_inline_code_and_name() {
        let raw = json!({ "code": "fr", "name": "Français", "a": "1", "b": "2" }).to_string();
        let pack = parse_custom_locale_pack(&raw, &opts()).unwrap();
        // `code` and `name` are strings, so they count as leaves too (4 total).
        assert_eq!((pack.code.as_str(), pack.name.as_str()), ("fr", "Français"));
    }

    #[test]
    fn real_catalog_ignores_top_level_code_and_name() {
        let raw = json!({
            "code": "WRONG", "name": "Wrong",
            "settings": { "a": "1", "b": "2", "c": "3" }
        })
        .to_string();
        assert_eq!(parse_custom_locale_pack(&raw, &opts()), Err(CustomLocaleError::InvalidCode));
        let o = ParseLocaleOptions { fallback_code: Some("it".into()), fallback_name: Some("Italiano".into()) };
        let pack = parse_custom_locale_pack(&raw, &o).unwrap();
        assert_eq!((pack.code.as_str(), pack.name.as_str()), ("it", "Italiano"));
    }

    #[test]
    fn rejects_bad_input() {
        assert_eq!(parse_custom_locale_pack("{", &opts()), Err(CustomLocaleError::InvalidJson));
        assert_eq!(parse_custom_locale_pack("[]", &opts()), Err(CustomLocaleError::NotObject));
        assert_eq!(parse_custom_locale_pack("null", &opts()), Err(CustomLocaleError::NotObject));

        let en = json!({ "code": "en", "messages": { "a": "1", "b": "2", "c": "3" } }).to_string();
        assert_eq!(
            parse_custom_locale_pack(&en, &opts()),
            Err(CustomLocaleError::BuiltInCode("en".into()))
        );

        let few = json!({ "code": "de", "messages": { "a": "1" } }).to_string();
        assert_eq!(parse_custom_locale_pack(&few, &opts()), Err(CustomLocaleError::TooFewStrings));

        let bad_code = json!({ "code": "1!", "messages": { "a": "1", "b": "2", "c": "3" } }).to_string();
        assert_eq!(parse_custom_locale_pack(&bad_code, &opts()), Err(CustomLocaleError::InvalidCode));

        let big = format!("\"{}\"", "x".repeat(MAX_LOCALE_JSON_CHARS));
        assert_eq!(parse_custom_locale_pack(&big, &opts()), Err(CustomLocaleError::TooLarge));
    }

    #[test]
    fn non_string_code_is_stringified_like_js() {
        let raw = json!({ "code": 12, "messages": { "a": "1", "b": "2", "c": "3" } }).to_string();
        assert_eq!(parse_custom_locale_pack(&raw, &opts()).unwrap_err(), CustomLocaleError::InvalidCode);
        let raw = json!({ "code": null, "lang": "nl", "messages": { "a": "1", "b": "2", "c": "3" } }).to_string();
        assert_eq!(parse_custom_locale_pack(&raw, &opts()).unwrap().code, "nl");
    }

    #[test]
    fn leaf_counting_ignores_arrays_and_deep_nodes() {
        assert_eq!(count_leaves(&json!({ "a": ["x", "y"], "b": 1, "c": "s" })), 1);
        let mut deep = json!("leaf");
        for _ in 0..14 {
            deep = json!({ "k": deep });
        }
        assert_eq!(count_leaves(&deep), 0);
    }

    #[test]
    fn name_is_truncated() {
        let raw = json!({
            "code": "xx", "name": "n".repeat(100),
            "messages": { "a": "1", "b": "2", "c": "3" }
        })
        .to_string();
        assert_eq!(parse_custom_locale_pack(&raw, &opts()).unwrap().name.len(), 64);
    }

    #[test]
    fn serializes_pretty_with_trailing_newline() {
        let pack = CustomLocalePack {
            code: "de".into(),
            name: "Deutsch".into(),
            messages: json!({ "a": "1" }).as_object().unwrap().clone(),
        };
        let text = serialize_custom_locale_pack(&pack);
        assert!(text.ends_with("}\n"));
        assert!(text.starts_with("{\n  \"code\": \"de\",\n  \"name\": \"Deutsch\",\n  \"messages\": {"));
        let back: CustomLocalePack = serde_json::from_str(&text).unwrap();
        assert_eq!(back, pack);
    }

    #[test]
    fn guesses_codes_from_file_names() {
        assert_eq!(guess_code_from_file_name("pl.json").as_deref(), Some("pl"));
        assert_eq!(guess_code_from_file_name("app.de.json").as_deref(), Some("de"));
        assert_eq!(guess_code_from_file_name("scribe_pt-BR.json").as_deref(), Some("pt-br"));
        assert_eq!(guess_code_from_file_name("scribe-lang-cs.json").as_deref(), Some("cs"));
        assert_eq!(guess_code_from_file_name("klingon.json").as_deref(), Some("klingon"));
        assert_eq!(guess_code_from_file_name("123.json"), None);
        assert_eq!(guess_code_from_file_name("").as_deref(), None);
    }
}
