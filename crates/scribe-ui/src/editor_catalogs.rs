//! Editor toolbar catalogs (font sizes, line heights, spacing, colors, font families)
//! ported from `editor/font-size.ts`, `block-spacing.ts`, and `font-family.ts`.

use serde::Serialize;

pub const FONT_SIZES: &[&str] = &[
    "10px", "11px", "12px", "14px", "16px", "18px", "20px", "22px", "24px", "28px", "32px", "36px",
    "48px",
];

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LabeledValue {
    pub label: &'static str,
    pub value: &'static str,
}

const fn lv(label: &'static str, value: &'static str) -> LabeledValue {
    LabeledValue { label, value }
}

pub const TEXT_COLORS: &[LabeledValue] = &[
    lv("Predvolená", ""),
    lv("Čierna", "#1d1d1f"),
    lv("Tmavo sivá", "#636366"),
    lv("Modrá", "#007aff"),
    lv("Indigo", "#5856d6"),
    lv("Fialová", "#af52de"),
    lv("Ružová", "#ff2d55"),
    lv("Červená", "#ff3b30"),
    lv("Oranžová", "#ff9500"),
    lv("Hnedá", "#a2845e"),
    lv("Zelená", "#34c759"),
    lv("Tyrkysová", "#5ac8fa"),
];

pub const HIGHLIGHT_COLORS: &[LabeledValue] = &[
    lv("Žltá", "#fff3a3"),
    lv("Zelená", "#d1fae5"),
    lv("Modrá", "#dbeafe"),
    lv("Ružová", "#fce7f3"),
    lv("Oranžová", "#ffedd5"),
    lv("Fialová", "#ede9fe"),
    lv("Sivá", "#e5e7eb"),
];

pub const LINE_HEIGHTS: &[LabeledValue] = &[
    lv("Jednoduché", "1.2"),
    lv("1,15", "1.15"),
    lv("1,5", "1.5"),
    lv("Dvojité", "2"),
];

pub const PARAGRAPH_SPACING: &[LabeledValue] = &[
    lv("Žiadne", "0px"),
    lv("Malé (6 px)", "6px"),
    lv("Stredné (12 px)", "12px"),
    lv("Veľké (18 px)", "18px"),
    lv("Extra (24 px)", "24px"),
];

/// A font family preset: either a literal `label` or an i18n `label_key`.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FontFamilyPreset {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label_key: Option<&'static str>,
    pub value: &'static str,
}

const fn key(label_key: &'static str, value: &'static str) -> FontFamilyPreset {
    FontFamilyPreset { label: None, label_key: Some(label_key), value }
}

const fn named(label: &'static str, value: &'static str) -> FontFamilyPreset {
    FontFamilyPreset { label: Some(label), label_key: None, value }
}

pub const FONT_FAMILIES: &[FontFamilyPreset] = &[
    key("toolbar.fonts.default", ""),
    key("toolbar.fonts.system", "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", sans-serif"),
    named("Helvetica", "Helvetica, Arial, sans-serif"),
    named("Arial", "Arial, Helvetica, sans-serif"),
    named("Inter", "Inter, system-ui, sans-serif"),
    named("Segoe UI", "\"Segoe UI\", Tahoma, sans-serif"),
    named("Trebuchet MS", "\"Trebuchet MS\", Helvetica, sans-serif"),
    named("Georgia", "Georgia, \"Times New Roman\", serif"),
    named("Times", "\"Times New Roman\", Times, serif"),
    named("Garamond", "Garamond, \"Times New Roman\", serif"),
    named("Palatino", "Palatino, \"Palatino Linotype\", serif"),
    named("Baskerville", "Baskerville, \"Times New Roman\", serif"),
    named("Verdana", "Verdana, Geneva, sans-serif"),
    named("Tahoma", "Tahoma, Geneva, sans-serif"),
    named("Courier", "\"Courier New\", Courier, monospace"),
    named("Monospace", "\"SF Mono\", Menlo, Monaco, monospace"),
    named("Consolas", "Consolas, \"Courier New\", monospace"),
];

pub const RECENT_FONTS_KEY: &str = "scribe-recent-fonts";
pub const MAX_RECENT_FONTS: usize = 8;

/// Strip quotes, collapse whitespace, trim, lowercase.
pub fn normalize_font_family(value: Option<&str>) -> String {
    let stripped = value.unwrap_or("").replace('"', "");
    stripped.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

pub fn is_preset_font_family(value: Option<&str>) -> bool {
    let normalized = normalize_font_family(value);
    if normalized.is_empty() {
        return true;
    }
    FONT_FAMILIES
        .iter()
        .any(|item| normalize_font_family(Some(item.value)) == normalized)
}

/// Human label for a font-family value. `translate` resolves i18n keys when provided.
pub fn font_family_label(
    editor_value: Option<&str>,
    translate: Option<&dyn Fn(&str) -> String>,
) -> String {
    let normalized = normalize_font_family(editor_value);
    if normalized.is_empty() {
        return match translate {
            Some(t) => t("toolbar.fonts.default"),
            None => "Predvolená".to_string(),
        };
    }

    if let Some(preset) = FONT_FAMILIES
        .iter()
        .find(|item| normalize_font_family(Some(item.value)) == normalized)
    {
        if let Some(label_key) = preset.label_key {
            return match translate {
                Some(t) => t(label_key),
                None if label_key == "toolbar.fonts.default" => "Predvolená".to_string(),
                None => "Systémová".to_string(),
            };
        }
        if let Some(label) = preset.label {
            return label.to_string();
        }
    }

    let first = editor_value
        .unwrap_or("")
        .split(',')
        .next()
        .unwrap_or("")
        .replace('"', "");
    let first = first.trim();
    if !first.is_empty() {
        return first.to_string();
    }
    match translate {
        Some(t) => t("toolbar.fonts.custom"),
        None => "Vlastný font".to_string(),
    }
}

/// Quote multi-word single families; keep lists and generic keywords as-is.
pub fn format_custom_font_family(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.contains(',') {
        return trimmed.to_string();
    }
    const GENERIC: [&str; 6] = ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"];
    if GENERIC.iter().any(|g| g.eq_ignore_ascii_case(trimmed)) {
        return trimmed.to_string();
    }
    if trimmed.chars().any(char::is_whitespace) {
        return format!("\"{trimmed}\"");
    }
    trimmed.to_string()
}

/// Parse the stored recent-fonts JSON (array of non-blank strings, capped).
pub fn parse_recent_fonts(raw: &str) -> Vec<String> {
    let Ok(serde_json::Value::Array(items)) = serde_json::from_str::<serde_json::Value>(raw) else {
        return Vec::new();
    };
    items
        .into_iter()
        .filter_map(|v| match v {
            serde_json::Value::String(s) if !s.trim().is_empty() => Some(s),
            _ => None,
        })
        .take(MAX_RECENT_FONTS)
        .collect()
}

/// Pure version of `pushRecentFont`: returns the new recent list (unchanged for presets/blank).
pub fn push_recent_font(existing: &[String], value: &str) -> Vec<String> {
    let formatted = format_custom_font_family(value);
    if formatted.is_empty() || is_preset_font_family(Some(&formatted)) {
        return existing.to_vec();
    }
    let norm = normalize_font_family(Some(&formatted));
    let mut next = vec![formatted];
    next.extend(
        existing
            .iter()
            .filter(|item| normalize_font_family(Some(item)) != norm)
            .cloned(),
    );
    next.truncate(MAX_RECENT_FONTS);
    next
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_sizes() {
        assert_eq!(FONT_SIZES.len(), 13);
        assert_eq!(TEXT_COLORS.len(), 12);
        assert_eq!(HIGHLIGHT_COLORS.len(), 7);
        assert_eq!(LINE_HEIGHTS.len(), 4);
        assert_eq!(PARAGRAPH_SPACING.len(), 5);
        assert_eq!(FONT_FAMILIES.len(), 17);
    }

    #[test]
    fn normalizes_and_detects_presets() {
        assert_eq!(normalize_font_family(Some("  \"Segoe  UI\" , Tahoma ")), "segoe ui , tahoma");
        assert!(is_preset_font_family(None));
        assert!(is_preset_font_family(Some("Helvetica, Arial, sans-serif")));
        assert!(!is_preset_font_family(Some("Comic Sans MS")));
    }

    #[test]
    fn labels() {
        assert_eq!(font_family_label(None, None), "Predvolená");
        assert_eq!(font_family_label(Some("Georgia, \"Times New Roman\", serif"), None), "Georgia");
        assert_eq!(
            font_family_label(Some("-apple-system, BlinkMacSystemFont, \"SF Pro Text\", sans-serif"), None),
            "Systémová"
        );
        assert_eq!(font_family_label(Some("\"Fira Code\", monospace"), None), "Fira Code");
        let t = |k: &str| format!("T:{k}");
        assert_eq!(font_family_label(Some(""), Some(&t)), "T:toolbar.fonts.default");
    }

    #[test]
    fn formats_custom_font_family() {
        assert_eq!(format_custom_font_family("  "), "");
        assert_eq!(format_custom_font_family("Fira Code"), "\"Fira Code\"");
        assert_eq!(format_custom_font_family("Fira"), "Fira");
        assert_eq!(format_custom_font_family("SERIF"), "SERIF");
        assert_eq!(format_custom_font_family("A B, serif"), "A B, serif");
    }

    #[test]
    fn recent_fonts_push_and_parse() {
        let existing = vec!["\"Fira Code\"".to_string(), "Lato".to_string()];
        let next = push_recent_font(&existing, "lato");
        assert_eq!(next, vec!["lato".to_string(), "\"Fira Code\"".to_string()]);
        assert_eq!(push_recent_font(&existing, "Arial, Helvetica, sans-serif"), existing);
        assert_eq!(parse_recent_fonts(r#"["a", 1, " ", "b"]"#), vec!["a", "b"]);
        assert!(parse_recent_fonts("nope").is_empty());
        let many: Vec<String> = (0..8).map(|i| format!("F{i}")).collect();
        assert_eq!(push_recent_font(&many, "New").len(), MAX_RECENT_FONTS);
    }
}
