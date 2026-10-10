//! Random theme generation (mirrors FE `generate-random-theme.ts`).

use rand::Rng;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeColors {
    pub background: String,
    pub foreground: String,
    pub muted_foreground: String,
    pub border: String,
    pub sidebar: String,
    pub sidebar_solid: String,
    pub toolbar: String,
    pub selection: String,
    pub selection_strong: String,
    pub hover: String,
    pub separator: String,
    pub format_bar: String,
    pub destructive: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ColorScheme {
    Light,
    Dark,
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.clamp(min, max)
}

fn hsl_to_hex(h: f64, s: f64, l: f64) -> String {
    let hue = ((h % 360.0) + 360.0) % 360.0;
    let sat = clamp(s, 0.0, 100.0) / 100.0;
    let light = clamp(l, 0.0, 100.0) / 100.0;
    let c = (1.0 - (2.0 * light - 1.0).abs()) * sat;
    let x = c * (1.0 - ((hue / 60.0) % 2.0 - 1.0).abs());
    let m = light - c / 2.0;
    let (r, g, b) = if hue < 60.0 {
        (c, x, 0.0)
    } else if hue < 120.0 {
        (x, c, 0.0)
    } else if hue < 180.0 {
        (0.0, c, x)
    } else if hue < 240.0 {
        (0.0, x, c)
    } else if hue < 300.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };
    let to_hex = |channel: f64| format!("{:02x}", ((channel + m) * 255.0).round() as u8);
    format!("#{}{}{}", to_hex(r), to_hex(g), to_hex(b))
}

fn hex_to_rgb(hex: &str) -> (u8, u8, u8) {
    let normalized = hex.trim_start_matches('#');
    let full = if normalized.len() == 3 {
        normalized
            .chars()
            .map(|c| format!("{c}{c}"))
            .collect::<String>()
    } else {
        normalized.chars().take(6).collect()
    };
    let r = u8::from_str_radix(full.get(0..2).unwrap_or("00"), 16).unwrap_or(0);
    let g = u8::from_str_radix(full.get(2..4).unwrap_or("00"), 16).unwrap_or(0);
    let b = u8::from_str_radix(full.get(4..6).unwrap_or("00"), 16).unwrap_or(0);
    (r, g, b)
}

fn rgba_from_hex(hex: &str, alpha: f64) -> String {
    let (r, g, b) = hex_to_rgb(hex);
    format!("rgba({r}, {g}, {b}, {alpha:.2})")
}

fn mix_hex(base: &str, accent: &str, amount: f64) -> String {
    let a = hex_to_rgb(base);
    let b = hex_to_rgb(accent);
    let ratio = clamp(amount, 0.0, 1.0);
    let mix = |from: u8, to: u8| -> u8 {
        (f64::from(from) + (f64::from(to) - f64::from(from)) * ratio).round() as u8
    };
    format!(
        "#{:02x}{:02x}{:02x}",
        mix(a.0, b.0),
        mix(a.1, b.1),
        mix(a.2, b.2)
    )
}

fn shift_lightness(hex: &str, delta: f64) -> String {
    let (r, g, b) = hex_to_rgb(hex);
    let rf = f64::from(r) / 255.0;
    let gf = f64::from(g) / 255.0;
    let bf = f64::from(b) / 255.0;
    let max = rf.max(gf).max(bf);
    let min = rf.min(gf).min(bf);
    let l = (max + min) / 2.0;
    let mut h = 0.0;
    let mut s = 0.0;
    if (max - min).abs() > f64::EPSILON {
        let d = max - min;
        s = if l > 0.5 {
            d / (2.0 - max - min)
        } else {
            d / (max + min)
        };
        h = if (max - rf).abs() < f64::EPSILON {
            ((gf - bf) / d + if gf < bf { 6.0 } else { 0.0 }) * 60.0
        } else if (max - gf).abs() < f64::EPSILON {
            ((bf - rf) / d + 2.0) * 60.0
        } else {
            ((rf - gf) / d + 4.0) * 60.0
        };
    }
    hsl_to_hex(h, s * 100.0, clamp(l * 100.0 + delta, 0.0, 100.0))
}

/// Generate a random theme. When `scheme` is `None`, randomly picks light/dark.
pub fn generate_random_theme(scheme: Option<ColorScheme>) -> ThemeColors {
    let mut rng = rand::thread_rng();
    let is_dark = match scheme {
        Some(ColorScheme::Dark) => true,
        Some(ColorScheme::Light) => false,
        None => rng.gen::<f64>() < 0.52,
    };
    let hue = rng.gen_range(0.0..360.0);
    let tint_hue = hue + rng.gen_range(-18.0..18.0);
    let accent_sat = rng.gen_range(58.0..88.0);
    let accent_light = if is_dark {
        rng.gen_range(54.0..70.0)
    } else {
        rng.gen_range(36.0..52.0)
    };
    let selection_strong = hsl_to_hex(hue, accent_sat, accent_light);
    let selection = rgba_from_hex(
        &selection_strong,
        if is_dark {
            rng.gen_range(0.18..0.26)
        } else {
            rng.gen_range(0.12..0.2)
        },
    );
    let destructive_hue = rng.gen_range(0.0..18.0);
    let destructive = hsl_to_hex(
        destructive_hue,
        rng.gen_range(78.0..92.0),
        if is_dark {
            rng.gen_range(58.0..66.0)
        } else {
            rng.gen_range(48.0..56.0)
        },
    );

    if is_dark {
        let background = hsl_to_hex(
            tint_hue,
            rng.gen_range(10.0..24.0),
            rng.gen_range(8.0..14.0),
        );
        let foreground = hsl_to_hex(
            tint_hue,
            rng.gen_range(8.0..18.0),
            rng.gen_range(90.0..96.0),
        );
        let muted_foreground = hsl_to_hex(
            tint_hue,
            rng.gen_range(6.0..14.0),
            rng.gen_range(58.0..68.0),
        );
        let sidebar_solid = shift_lightness(&background, rng.gen_range(3.0..7.0));
        let toolbar = shift_lightness(&background, rng.gen_range(-2.0..2.0));
        let format_bar = shift_lightness(&sidebar_solid, rng.gen_range(2.0..5.0));
        let (fr, fg, fb) = hex_to_rgb(&foreground);
        return ThemeColors {
            background,
            foreground,
            muted_foreground,
            border: format!("rgba({fr}, {fg}, {fb}, 0.1)"),
            sidebar: rgba_from_hex(&sidebar_solid, 0.88),
            sidebar_solid,
            toolbar: rgba_from_hex(&toolbar, 0.9),
            selection,
            selection_strong,
            hover: format!("rgba({fr}, {fg}, {fb}, 0.06)"),
            separator: format!("rgba({fr}, {fg}, {fb}, 0.08)"),
            format_bar: rgba_from_hex(&format_bar, 0.94),
            destructive,
        };
    }

    let background = hsl_to_hex(
        tint_hue,
        rng.gen_range(18.0..42.0),
        rng.gen_range(95.0..99.0),
    );
    let foreground = hsl_to_hex(
        tint_hue,
        rng.gen_range(12.0..28.0),
        rng.gen_range(12.0..22.0),
    );
    let muted_foreground = hsl_to_hex(
        tint_hue,
        rng.gen_range(8.0..18.0),
        rng.gen_range(42.0..52.0),
    );
    let sidebar_solid = shift_lightness(&background, rng.gen_range(-4.0..-1.0));
    let toolbar = mix_hex(&background, "#ffffff", rng.gen_range(0.15..0.35));
    let format_bar = mix_hex(&background, "#ffffff", rng.gen_range(0.35..0.55));
    let (fr, fg, fb) = hex_to_rgb(&foreground);
    ThemeColors {
        background,
        foreground,
        muted_foreground,
        border: format!("rgba({fr}, {fg}, {fb}, 0.09)"),
        sidebar: rgba_from_hex(&sidebar_solid, 0.9),
        sidebar_solid,
        toolbar: rgba_from_hex(&toolbar, 0.88),
        selection,
        selection_strong,
        hover: format!("rgba({fr}, {fg}, {fb}, 0.04)"),
        separator: format!("rgba({fr}, {fg}, {fb}, 0.06)"),
        format_bar: rgba_from_hex(&format_bar, 0.94),
        destructive,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_hex_colors() {
        let theme = generate_random_theme(Some(ColorScheme::Dark));
        assert!(theme.background.starts_with('#'));
        assert!(theme.selection_strong.starts_with('#'));
        assert!(theme.selection.starts_with("rgba("));
    }
}
