//! Resolve theme color token keys to hex (ported from `src/lib/resolve-color.ts`).

use serde::{Deserialize, Serialize};

/// Token keys that may be passed as a `color` prop.
pub const THEME_COLOR_KEYS: &[&str] = &[
    "foreground",
    "background",
    "muted",
    "mutedForeground",
    "primary",
    "primaryForeground",
    "border",
    "accent",
    "destructive",
    "success",
    "warning",
    "info",
];

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ColorTokens {
    pub foreground: String,
    pub background: String,
    pub muted: String,
    pub muted_foreground: String,
    pub primary: String,
    pub primary_foreground: String,
    pub border: String,
    pub accent: String,
    pub destructive: String,
    pub success: String,
    pub warning: String,
    pub info: String,
}

impl ColorTokens {
    /// Lookup by camelCase token key.
    pub fn get(&self, key: &str) -> Option<&str> {
        Some(match key {
            "foreground" => &self.foreground,
            "background" => &self.background,
            "muted" => &self.muted,
            "mutedForeground" => &self.muted_foreground,
            "primary" => &self.primary,
            "primaryForeground" => &self.primary_foreground,
            "border" => &self.border,
            "accent" => &self.accent,
            "destructive" => &self.destructive,
            "success" => &self.success,
            "warning" => &self.warning,
            "info" => &self.info,
            _ => return None,
        })
    }
}

pub fn is_theme_color_key(value: &str) -> bool {
    THEME_COLOR_KEYS.contains(&value)
}

/// Theme token key → its color; any other value is returned as-is (raw CSS color).
pub fn resolve_color(value: &str, colors: &ColorTokens) -> String {
    colors.get(value).unwrap_or(value).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tokens() -> ColorTokens {
        ColorTokens {
            foreground: "#111".into(),
            muted_foreground: "#777".into(),
            primary: "#00f".into(),
            ..Default::default()
        }
    }

    #[test]
    fn resolves_token_keys() {
        let t = tokens();
        assert_eq!(resolve_color("foreground", &t), "#111");
        assert_eq!(resolve_color("mutedForeground", &t), "#777");
        assert_eq!(resolve_color("primary", &t), "#00f");
    }

    #[test]
    fn passes_through_raw_colors() {
        let t = tokens();
        assert_eq!(resolve_color("#ff0000", &t), "#ff0000");
        assert_eq!(resolve_color("rebeccapurple", &t), "rebeccapurple");
    }

    #[test]
    fn every_key_is_resolvable() {
        let t = tokens();
        for key in THEME_COLOR_KEYS {
            assert!(t.get(key).is_some(), "{key}");
            assert!(is_theme_color_key(key));
        }
        assert!(!is_theme_color_key("nope"));
    }
}
