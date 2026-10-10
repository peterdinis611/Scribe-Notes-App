//! Curated UI typography preset catalog (kv load/save stays FE).

use serde::{Deserialize, Serialize};

pub const UI_FONTS_STORAGE_KEY: &str = "scribe-ui-fonts-v1";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UiFontPreset {
    pub id: String,
    pub sample: String,
    pub sans: String,
    pub display: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub google: Vec<String>,
}

pub fn ui_font_presets() -> Vec<UiFontPreset> {
    vec![
        UiFontPreset {
            id: "default".into(),
            sample: "Aa".into(),
            sans: "\"Figtree\", \"Avenir Next\", \"Segoe UI\", sans-serif".into(),
            display: "\"Fraunces\", \"Iowan Old Style\", \"Palatino Linotype\", serif".into(),
            google: vec![],
        },
        UiFontPreset {
            id: "system".into(),
            sample: "Aa".into(),
            sans: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, sans-serif".into(),
            display: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, sans-serif".into(),
            google: vec![],
        },
        UiFontPreset {
            id: "serif".into(),
            sample: "Aa".into(),
            sans: "Georgia, \"Iowan Old Style\", \"Times New Roman\", serif".into(),
            display: "\"Iowan Old Style\", Georgia, \"Palatino Linotype\", serif".into(),
            google: vec![],
        },
        UiFontPreset {
            id: "mono".into(),
            sample: "Aa".into(),
            sans: "\"IBM Plex Mono\", ui-monospace, \"SF Mono\", Menlo, monospace".into(),
            display: "\"IBM Plex Mono\", ui-monospace, \"SF Mono\", Menlo, monospace".into(),
            google: vec![],
        },
        UiFontPreset {
            id: "readable".into(),
            sample: "Aa".into(),
            sans: "\"Lexend\", \"Figtree\", \"Avenir Next\", sans-serif".into(),
            display: "\"Lexend\", \"Fraunces\", \"Iowan Old Style\", serif".into(),
            google: vec!["Lexend".into()],
        },
        UiFontPreset {
            id: "literary".into(),
            sample: "Aa".into(),
            sans: "\"Source Serif 4\", Georgia, serif".into(),
            display: "\"Playfair Display\", \"Fraunces\", Georgia, serif".into(),
            google: vec!["Source Serif 4".into(), "Playfair Display".into()],
        },
    ]
}

pub fn ui_font_preset_ids() -> Vec<String> {
    ui_font_presets().into_iter().map(|p| p.id).collect()
}

pub fn is_ui_font_preset_id(value: &str) -> bool {
    ui_font_preset_ids().iter().any(|id| id == value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_default() {
        assert!(is_ui_font_preset_id("default"));
        assert_eq!(ui_font_presets().len(), 6);
    }
}
