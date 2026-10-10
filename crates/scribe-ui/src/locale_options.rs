//! Locale dropdown options (`src/lib/i18n/locale-options.ts`).

use serde::{Deserialize, Serialize};

pub const BUILT_IN_LOCALES: &[&str] = &["sk", "en"];
pub const DEFAULT_LOCALE: &str = "sk";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LocaleKind {
    Builtin,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocaleOption {
    pub code: String,
    pub label: String,
    pub short: String,
    pub kind: LocaleKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_default: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CustomLocaleInput {
    pub code: String,
    pub name: String,
}

/// (id, i18n label key, short label)
const BUILT_IN: &[(&str, &str, &str)] = &[
    ("sk", "settings.language.sk", "SK"),
    ("en", "settings.language.en", "EN"),
];

fn built_in_rank(code: &str) -> usize {
    BUILT_IN_LOCALES.iter().position(|c| *c == code).unwrap_or(usize::MAX)
}

/// SK (default) first, then EN, then custom packs. `label_for` resolves i18n keys.
pub fn build_locale_options(
    label_for: impl Fn(&str) -> String,
    custom_locales: &[CustomLocaleInput],
) -> Vec<LocaleOption> {
    let mut built_in: Vec<LocaleOption> = BUILT_IN
        .iter()
        .map(|(id, label_key, short)| LocaleOption {
            code: (*id).to_string(),
            label: label_for(label_key),
            short: (*short).to_string(),
            kind: LocaleKind::Builtin,
            is_default: Some(*id == DEFAULT_LOCALE),
        })
        .collect();

    built_in.sort_by(|a, b| {
        if a.code == DEFAULT_LOCALE {
            return std::cmp::Ordering::Less;
        }
        if b.code == DEFAULT_LOCALE {
            return std::cmp::Ordering::Greater;
        }
        built_in_rank(&a.code).cmp(&built_in_rank(&b.code))
    });

    built_in.extend(custom_locales.iter().map(|pack| LocaleOption {
        code: pack.code.clone(),
        label: pack.name.clone(),
        short: pack.code.chars().take(3).collect::<String>().to_uppercase(),
        kind: LocaleKind::Custom,
        is_default: None,
    }));
    built_in
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orders_builtin_then_custom() {
        let customs = vec![CustomLocaleInput { code: "deu".into(), name: "Deutsch".into() }];
        let opts = build_locale_options(|k| format!("L:{k}"), &customs);
        let codes: Vec<_> = opts.iter().map(|o| o.code.as_str()).collect();
        assert_eq!(codes, ["sk", "en", "deu"]);
        assert_eq!(opts[0].label, "L:settings.language.sk");
        assert_eq!(opts[0].is_default, Some(true));
        assert_eq!(opts[1].is_default, Some(false));
        assert_eq!(opts[2].short, "DEU");
        assert_eq!(opts[2].kind, LocaleKind::Custom);
    }

    #[test]
    fn serializes_camel_case() {
        let opts = build_locale_options(|k| k.to_string(), &[]);
        let json = serde_json::to_value(&opts[0]).unwrap();
        assert_eq!(json["kind"], "builtin");
        assert_eq!(json["isDefault"], true);
        let custom = build_locale_options(|k| k.to_string(), &[CustomLocaleInput { code: "fr".into(), name: "Français".into() }]);
        assert!(serde_json::to_value(&custom[2]).unwrap().get("isDefault").is_none());
    }
}
