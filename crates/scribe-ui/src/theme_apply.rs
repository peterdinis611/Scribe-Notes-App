//! Theme resolution for applying to the document (`src/lib/themes/apply.ts`).
//!
//! `matchMedia` and `document.documentElement` access stay in the frontend: callers pass
//! `prefers_dark` in and get back the CSS variables / `data-theme` / `dark` class to set
//! (see [`plan_theme_application`]).

use serde::{Deserialize, Serialize};

use crate::pdf_highlights::parse_rgb_triplet;
use crate::skin::UiSkin;
use crate::theme_presets::{
    default_custom_theme, get_preset_by_id, next_cycle_theme, ThemeColorScheme, ThemeColors,
    ThemeSettings, THEME_ID_CUSTOM, THEME_ID_SYSTEM,
};

/// Result of [`resolve_theme_colors`].
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedTheme {
    pub colors: ThemeColors,
    pub color_scheme: ThemeColorScheme,
    /// Never `"system"`.
    pub resolved_id: String,
}

/// One `style.setProperty(name, value)` call.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CssVar {
    pub name: String,
    pub value: String,
}

/// Everything `applyThemeSettings` writes to `<html>`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeApplication {
    pub css_vars: Vec<CssVar>,
    /// `dataset.theme` (`"system"` when following the OS, else the resolved id).
    pub data_theme: String,
    /// `classList.toggle('dark', …)`
    pub is_dark: bool,
    /// `style.colorScheme`: `"light"` or `"dark"`.
    pub color_scheme: String,
    pub resolved_id: String,
    pub skin: String,
}

/// `system` → `dark` / `light` per OS preference; any other id is returned unchanged.
pub fn resolve_theme_id(theme_id: &str, prefers_dark: bool) -> String {
    if theme_id == THEME_ID_SYSTEM {
        return if prefers_dark { "dark" } else { "light" }.to_string();
    }
    theme_id.to_string()
}

fn relative_luminance(r: f64, g: f64, b: f64) -> f64 {
    let channel = |v: f64| {
        let c = v / 255.0;
        if c <= 0.03928 {
            c / 12.92
        } else {
            ((c + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/// JS `parseInt(s, 16)`: leading hex digits, `NaN` when there are none.
fn parse_int_hex(s: &str) -> f64 {
    let digits: String = s.chars().take_while(char::is_ascii_hexdigit).collect();
    if digits.is_empty() {
        return f64::NAN;
    }
    u64::from_str_radix(&digits, 16).map(|v| v as f64).unwrap_or(f64::NAN)
}

/// Whether a `#rgb` / `#rrggbb` / `rgb()` / `rgba()` color has luminance below 0.5.
/// Unparsable colors count as light.
pub fn is_dark_color(color: &str) -> bool {
    let normalized = color.trim();
    if normalized.starts_with("rgb") {
        return match parse_rgb_triplet(normalized) {
            Some((r, g, b)) => relative_luminance(r as f64, g as f64, b as f64) < 0.5,
            None => false,
        };
    }

    let hex = normalized.replacen('#', "", 1);
    let full: String = if hex.chars().count() == 3 {
        hex.chars().flat_map(|c| [c, c]).collect()
    } else {
        hex.chars().take(6).collect()
    };
    let part = |from: usize| -> String { full.chars().skip(from).take(2).collect() };
    let (r, g, b) = (parse_int_hex(&part(0)), parse_int_hex(&part(2)), parse_int_hex(&part(4)));
    // NaN compares false, matching the frontend.
    relative_luminance(r, g, b) < 0.5
}

fn scheme_of(colors: &ThemeColors) -> ThemeColorScheme {
    if is_dark_color(&colors.background) {
        ThemeColorScheme::Dark
    } else {
        ThemeColorScheme::Light
    }
}

/// Colors + scheme + concrete id for the given settings.
pub fn resolve_theme_colors(settings: &ThemeSettings, prefers_dark: bool) -> ResolvedTheme {
    if settings.theme_id == THEME_ID_CUSTOM {
        if let Some(custom) = &settings.custom_theme {
            return ResolvedTheme {
                color_scheme: scheme_of(custom),
                colors: custom.clone(),
                resolved_id: THEME_ID_CUSTOM.to_string(),
            };
        }
    }

    let resolved_id = resolve_theme_id(&settings.theme_id, prefers_dark);
    if resolved_id == THEME_ID_CUSTOM {
        let fallback = settings.custom_theme.clone().unwrap_or_else(default_custom_theme);
        return ResolvedTheme {
            color_scheme: scheme_of(&fallback),
            colors: fallback,
            resolved_id: THEME_ID_CUSTOM.to_string(),
        };
    }

    match get_preset_by_id(&resolved_id) {
        Some(preset) => ResolvedTheme {
            colors: preset.colors,
            color_scheme: preset.color_scheme,
            resolved_id: preset.id,
        },
        None => {
            let light = get_preset_by_id("light").expect("light preset exists");
            ResolvedTheme {
                colors: light.colors,
                color_scheme: ThemeColorScheme::Light,
                resolved_id: "light".to_string(),
            }
        }
    }
}

/// Classic skin flattens the stock light / dark palettes; Grove (and named presets) are untouched.
pub fn colors_for_skin(colors: &ThemeColors, resolved_id: &str, skin: UiSkin) -> ThemeColors {
    if skin != UiSkin::Classic {
        return colors.clone();
    }
    match resolved_id {
        "dark" => ThemeColors {
            background: "#151c18".into(),
            sidebar_solid: "#1a221d".into(),
            toolbar: "rgba(21, 28, 24, 0.96)".into(),
            ..colors.clone()
        },
        "light" => ThemeColors {
            background: "#eef4eb".into(),
            sidebar: "rgba(232, 240, 228, 0.92)".into(),
            sidebar_solid: "#e4eee0".into(),
            toolbar: "rgba(238, 244, 235, 0.96)".into(),
            ..colors.clone()
        },
        _ => colors.clone(),
    }
}

/// CSS custom properties for a color set, in the order the frontend sets them.
pub fn theme_css_vars(colors: &ThemeColors) -> Vec<CssVar> {
    let var = |name: &str, value: &str| CssVar { name: name.to_string(), value: value.to_string() };
    vec![
        var("--color-background", &colors.background),
        var("--color-foreground", &colors.foreground),
        var("--color-muted-foreground", &colors.muted_foreground),
        var("--color-border", &colors.border),
        var("--color-sidebar", &colors.sidebar),
        var("--color-sidebar-solid", &colors.sidebar_solid),
        var("--color-toolbar", &colors.toolbar),
        var("--color-selection", &colors.selection),
        var("--color-selection-strong", &colors.selection_strong),
        var("--color-hover", &colors.hover),
        var("--color-separator", &colors.separator),
        var("--color-format-bar", &colors.format_bar),
        var("--color-destructive", &colors.destructive),
        var("--color-accent", &colors.selection_strong),
        var("--color-surface", &colors.sidebar_solid),
        var("--color-surface-elevated", &colors.background),
        var("--color-canvas", &colors.sidebar_solid),
    ]
}

/// Pure half of `applyThemeSettings`: what to write to the document root.
pub fn plan_theme_application(
    settings: &ThemeSettings,
    skin: UiSkin,
    prefers_dark: bool,
) -> ThemeApplication {
    let resolved = resolve_theme_colors(settings, prefers_dark);
    let colors = colors_for_skin(&resolved.colors, &resolved.resolved_id, skin);
    let is_dark = resolved.color_scheme == ThemeColorScheme::Dark;
    ThemeApplication {
        css_vars: theme_css_vars(&colors),
        data_theme: if settings.theme_id == THEME_ID_SYSTEM {
            THEME_ID_SYSTEM.to_string()
        } else {
            resolved.resolved_id.clone()
        },
        is_dark,
        color_scheme: if is_dark { "dark" } else { "light" }.to_string(),
        resolved_id: resolved.resolved_id,
        skin: skin.as_id().to_string(),
    }
}

/// Next theme in the cycle shortcut; unknown ids restart at `system`.
pub fn cycle_theme_id(current: &str) -> String {
    next_cycle_theme(current).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(id: &str, custom: Option<ThemeColors>) -> ThemeSettings {
        ThemeSettings { theme_id: id.into(), custom_theme: custom }
    }

    #[test]
    fn resolves_system() {
        assert_eq!(resolve_theme_id("system", true), "dark");
        assert_eq!(resolve_theme_id("system", false), "light");
        assert_eq!(resolve_theme_id("nord", true), "nord");
    }

    #[test]
    fn detects_dark_colors() {
        assert!(is_dark_color("#000"));
        assert!(is_dark_color("#121a16"));
        assert!(!is_dark_color("#fff"));
        assert!(!is_dark_color("#e7efe4"));
        assert!(is_dark_color("rgb(10, 10, 10)"));
        assert!(!is_dark_color("rgba(250, 250, 250, 0.9)"));
        assert!(!is_dark_color("rgb(nonsense)"));
        assert!(!is_dark_color("transparent"));
        assert!(is_dark_color("  #1c1f24  "));
    }

    #[test]
    fn resolves_presets_and_system() {
        let dark = resolve_theme_colors(&settings("system", None), true);
        assert_eq!(dark.resolved_id, "dark");
        assert_eq!(dark.color_scheme, ThemeColorScheme::Dark);
        assert_eq!(dark.colors, get_preset_by_id("dark").unwrap().colors);

        let nord = resolve_theme_colors(&settings("nord", None), false);
        assert_eq!(nord.resolved_id, "nord");
        assert_eq!(nord.color_scheme, ThemeColorScheme::Dark);

        let unknown = resolve_theme_colors(&settings("bogus", None), true);
        assert_eq!(unknown.resolved_id, "light");
        assert_eq!(unknown.color_scheme, ThemeColorScheme::Light);
    }

    #[test]
    fn resolves_custom() {
        let mut custom = default_custom_theme();
        custom.background = "#101010".into();
        let r = resolve_theme_colors(&settings("custom", Some(custom.clone())), false);
        assert_eq!(r.resolved_id, "custom");
        assert_eq!(r.color_scheme, ThemeColorScheme::Dark);
        assert_eq!(r.colors, custom);

        // `custom` without colors falls back to the default (light) custom theme.
        let r = resolve_theme_colors(&settings("custom", None), true);
        assert_eq!(r.resolved_id, "custom");
        assert_eq!(r.color_scheme, ThemeColorScheme::Light);
        assert_eq!(r.colors, default_custom_theme());
    }

    #[test]
    fn classic_skin_flattens_light_and_dark_only() {
        let light = get_preset_by_id("light").unwrap().colors;
        let dark = get_preset_by_id("dark").unwrap().colors;
        let nord = get_preset_by_id("nord").unwrap().colors;
        assert_eq!(colors_for_skin(&light, "light", UiSkin::Grove), light);
        assert_eq!(colors_for_skin(&nord, "nord", UiSkin::Classic), nord);

        let l = colors_for_skin(&light, "light", UiSkin::Classic);
        assert_eq!(l.background, "#eef4eb");
        assert_eq!(l.sidebar_solid, "#e4eee0");
        assert_eq!(l.foreground, light.foreground);

        let d = colors_for_skin(&dark, "dark", UiSkin::Classic);
        assert_eq!(d.background, "#151c18");
        assert_eq!(d.toolbar, "rgba(21, 28, 24, 0.96)");
        assert_eq!(d.sidebar, dark.sidebar);
    }

    #[test]
    fn plans_application() {
        let plan = plan_theme_application(&settings("system", None), UiSkin::Grove, true);
        assert_eq!(plan.data_theme, "system");
        assert_eq!(plan.resolved_id, "dark");
        assert!(plan.is_dark);
        assert_eq!(plan.color_scheme, "dark");
        assert_eq!(plan.css_vars.len(), 17);
        assert_eq!(plan.css_vars[0].name, "--color-background");
        let get = |n: &str| plan.css_vars.iter().find(|v| v.name == n).unwrap().value.clone();
        assert_eq!(get("--color-accent"), get("--color-selection-strong"));
        assert_eq!(get("--color-canvas"), get("--color-sidebar-solid"));
        assert_eq!(get("--color-surface-elevated"), get("--color-background"));

        let plan = plan_theme_application(&settings("sepia", None), UiSkin::Classic, false);
        assert_eq!(plan.data_theme, "sepia");
        assert!(!plan.is_dark);
        assert_eq!(plan.skin, "classic");

        let v = serde_json::to_value(&plan).unwrap();
        assert!(v.get("cssVars").is_some());
        assert!(v.get("dataTheme").is_some());
    }

    #[test]
    fn cycles() {
        assert_eq!(cycle_theme_id("system"), "light");
        assert_eq!(cycle_theme_id("twilight"), "system");
        assert_eq!(cycle_theme_id("custom"), "system");
    }
}
