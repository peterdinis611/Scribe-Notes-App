//! Contrast-safe colors for print/PDF export.

fn parse_rgb(color: &str) -> Option<(u8, u8, u8, f64)> {
    let value = color.trim().to_ascii_lowercase();
    if value.is_empty() {
        return None;
    }

    if let Some(hex) = value.strip_prefix('#') {
        if hex.len() == 3 {
            let r = u8::from_str_radix(&format!("{0}{0}", &hex[0..1]), 16).ok()?;
            let g = u8::from_str_radix(&format!("{0}{0}", &hex[1..2]), 16).ok()?;
            let b = u8::from_str_radix(&format!("{0}{0}", &hex[2..3]), 16).ok()?;
            return Some((r, g, b, 1.0));
        }
        if hex.len() == 6 || hex.len() == 8 {
            let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
            let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
            let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
            let a = if hex.len() == 8 {
                u8::from_str_radix(&hex[6..8], 16).ok()? as f64 / 255.0
            } else {
                1.0
            };
            return Some((r, g, b, a));
        }
        return None;
    }

    let inner = value
        .strip_prefix("rgba(")
        .or_else(|| value.strip_prefix("rgb("))?
        .strip_suffix(')')?;
    let parts: Vec<&str> = inner.split(',').map(str::trim).collect();
    if parts.len() < 3 {
        return None;
    }
    let r: f64 = parts[0].parse().ok()?;
    let g: f64 = parts[1].parse().ok()?;
    let b: f64 = parts[2].parse().ok()?;
    let a: f64 = parts.get(3).and_then(|p| p.parse().ok()).unwrap_or(1.0);
    if ![r, g, b, a].iter().all(|c| c.is_finite()) {
        return None;
    }
    Some((r as u8, g as u8, b as u8, a))
}

fn relative_luminance(r: u8, g: u8, b: u8) -> f64 {
    let channel = |c: u8| {
        let c = c as f64 / 255.0;
        if c <= 0.03928 {
            c / 12.92
        } else {
            ((c + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

fn contrast_ratio(l1: f64, l2: f64) -> f64 {
    let lighter = l1.max(l2);
    let darker = l1.min(l2);
    (lighter + 0.05) / (darker + 0.05)
}

/// Keep intentional dark colors; lift low-contrast light text saved from dark mode.
pub fn color_for_export(color: &str, background: &str) -> String {
    let Some((r, g, b, a)) = parse_rgb(color) else {
        return color.to_string();
    };
    if a < 0.2 {
        return color.to_string();
    }
    let (br, bg, bb, _) = parse_rgb(background).unwrap_or((255, 255, 255, 1.0));
    let fg_lum = relative_luminance(r, g, b);
    let bg_lum = relative_luminance(br, bg, bb);

    if contrast_ratio(fg_lum, bg_lum) >= 4.5 {
        return color.to_string();
    }
    if fg_lum > 0.72 {
        return "#111111".into();
    }
    if bg_lum > fg_lum && fg_lum > 0.55 {
        return "#111111".into();
    }
    color.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lifts_light_on_white() {
        assert_eq!(color_for_export("#eeeeee", "#ffffff"), "#111111");
        assert_eq!(color_for_export("#111111", "#ffffff"), "#111111");
        assert_eq!(color_for_export("rgba(0,0,0,0.05)", "#ffffff"), "rgba(0,0,0,0.05)");
    }
}
