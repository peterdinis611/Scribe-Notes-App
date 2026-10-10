//! Theme presets (ids + color maps) ported from `src/lib/themes/{types,presets}.ts`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
pub enum ThemeColorScheme {
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThemePreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub color_scheme: ThemeColorScheme,
    pub colors: ThemeColors,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeSettings {
    pub theme_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_theme: Option<ThemeColors>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThemeColorField {
    pub key: &'static str,
    pub label: &'static str,
}

pub const THEME_COLOR_FIELDS: &[ThemeColorField] = &[
    ThemeColorField { key: "background", label: "Pozadie" },
    ThemeColorField { key: "foreground", label: "Text" },
    ThemeColorField { key: "mutedForeground", label: "Sekundárny text" },
    ThemeColorField { key: "border", label: "Okraje" },
    ThemeColorField { key: "sidebar", label: "Sidebar" },
    ThemeColorField { key: "sidebarSolid", label: "Sidebar plný" },
    ThemeColorField { key: "toolbar", label: "Panel nástrojov" },
    ThemeColorField { key: "selection", label: "Výber" },
    ThemeColorField { key: "selectionStrong", label: "Akcent" },
    ThemeColorField { key: "hover", label: "Hover" },
    ThemeColorField { key: "formatBar", label: "Formátovací panel" },
    ThemeColorField { key: "destructive", label: "Chyba / zmazať" },
];

/// `system` and `custom` are valid theme ids but have no preset entry.
pub const THEME_ID_SYSTEM: &str = "system";
pub const THEME_ID_CUSTOM: &str = "custom";

/// Order used by the "cycle theme" shortcut (mirrors `CYCLE_THEME_ORDER`).
pub const CYCLE_THEME_ORDER: &[&str] = &[
    "system", "light", "dark", "sepia", "paper", "rose", "mint", "lavender", "solar", "nord", "midnight", "forest", "ocean", "dracula", "coffee", "grape", "slate", "cherry", "arctic", "sandstorm", "neon", "graphite", "peach", "cobalt", "ember", "jade", "plum", "storm", "honey", "ink", "coral", "sage", "twilight"
];

/// id, name, description, is_dark, colors in `ThemeColors` field order:
/// background, foreground, mutedForeground, border, sidebar, sidebarSolid, toolbar,
/// selection, selectionStrong, hover, separator, formatBar, destructive.
type PresetRow = (&'static str, &'static str, &'static str, bool, [&'static str; 13]);

const PRESET_ROWS: &[PresetRow] = &[
    ("light", "Svetlá", "Grove — mäkký sage papier", false, [
        "#e7efe4", "#1c2b22", "#5c7264", "rgba(28, 43, 34, 0.12)", "rgba(214, 228, 210, 0.88)", "#d6e4d2", "rgba(231, 239, 228, 0.94)", "rgba(63, 122, 90, 0.18)", "#3f7a5a", "rgba(28, 43, 34, 0.05)", "rgba(28, 43, 34, 0.08)", "rgba(244, 248, 242, 0.96)", "#b42318",
    ]),
    ("dark", "Tmavá", "Grove — hlboká hlina", true, [
        "#121a16", "#e4efe6", "#8fa898", "rgba(228, 239, 230, 0.1)", "rgba(22, 32, 26, 0.94)", "#16201a", "rgba(18, 26, 22, 0.94)", "rgba(124, 184, 146, 0.22)", "#7cb892", "rgba(228, 239, 230, 0.06)", "rgba(228, 239, 230, 0.08)", "rgba(28, 40, 33, 0.96)", "#f97066",
    ]),
    ("sepia", "Sépiová", "Teplé pozadie pre dlhé čítanie", false, [
        "#f4ecd8", "#3d3428", "#7a6f5c", "rgba(61, 52, 40, 0.12)", "rgba(237, 228, 210, 0.85)", "#ede4d2", "rgba(244, 236, 216, 0.9)", "rgba(166, 124, 62, 0.18)", "#a67c3e", "rgba(61, 52, 40, 0.06)", "rgba(61, 52, 40, 0.08)", "rgba(250, 244, 232, 0.95)", "#c0392b",
    ]),
    ("paper", "Papier", "Jemne krémová, ako list papiera", false, [
        "#fffef9", "#2c2c2c", "#6b6b6b", "rgba(0, 0, 0, 0.07)", "rgba(250, 249, 244, 0.9)", "#faf9f4", "rgba(255, 254, 249, 0.92)", "rgba(196, 92, 38, 0.14)", "#c45c26", "rgba(0, 0, 0, 0.035)", "rgba(0, 0, 0, 0.05)", "rgba(255, 255, 255, 0.96)", "#b42318",
    ]),
    ("blotter", "Press", "Tmavý tlačiarenský stôl — atrament a meď", true, [
        "#10141a", "#e8e4dc", "#8b939e", "rgba(232, 228, 220, 0.1)", "rgba(22, 28, 36, 0.95)", "#161c24", "rgba(16, 20, 26, 0.96)", "rgba(196, 92, 38, 0.28)", "#c45c26", "rgba(232, 228, 220, 0.06)", "rgba(232, 228, 220, 0.08)", "rgba(28, 34, 42, 0.97)", "#f97066",
    ]),
    ("rose", "Ružová", "Jemná svetlá téma s ružovým akcentom", false, [
        "#fff8f9", "#2d2224", "#8a7378", "rgba(45, 34, 36, 0.08)", "rgba(255, 241, 244, 0.9)", "#fff1f4", "rgba(255, 248, 249, 0.92)", "rgba(219, 84, 119, 0.16)", "#db5477", "rgba(45, 34, 36, 0.04)", "rgba(45, 34, 36, 0.06)", "rgba(255, 255, 255, 0.94)", "#e04545",
    ]),
    ("nord", "Nord", "Studená severská paleta", true, [
        "#2e3440", "#eceff4", "#d8dee9", "rgba(236, 239, 244, 0.1)", "rgba(46, 52, 64, 0.88)", "#3b4252", "rgba(46, 52, 64, 0.92)", "rgba(136, 192, 208, 0.22)", "#88c0d0", "rgba(236, 239, 244, 0.06)", "rgba(236, 239, 244, 0.08)", "rgba(59, 66, 82, 0.95)", "#bf616a",
    ]),
    ("midnight", "Polnoc", "Tmavomodrá nočná téma", true, [
        "#0f1419", "#e7ecf3", "#8b9cb3", "rgba(231, 236, 243, 0.1)", "rgba(18, 24, 32, 0.9)", "#121820", "rgba(15, 20, 25, 0.92)", "rgba(91, 156, 255, 0.2)", "#5b9cff", "rgba(231, 236, 243, 0.06)", "rgba(231, 236, 243, 0.08)", "rgba(22, 30, 40, 0.96)", "#ff6b6b",
    ]),
    ("forest", "Les", "Tmavozelená pokojná téma", true, [
        "#1a231c", "#e8f0ea", "#9bb0a0", "rgba(232, 240, 234, 0.1)", "rgba(26, 35, 28, 0.9)", "#222d25", "rgba(26, 35, 28, 0.92)", "rgba(106, 168, 118, 0.22)", "#6aa876", "rgba(232, 240, 234, 0.06)", "rgba(232, 240, 234, 0.08)", "rgba(34, 45, 37, 0.96)", "#e07070",
    ]),
    ("mint", "Mäta", "Svetlá svieža zelená téma", false, [
        "#f4fbf7", "#1f2e26", "#5f7568", "rgba(31, 46, 38, 0.09)", "rgba(232, 248, 238, 0.92)", "#e8f8ee", "rgba(244, 251, 247, 0.94)", "rgba(46, 160, 110, 0.16)", "#2ea06e", "rgba(31, 46, 38, 0.04)", "rgba(31, 46, 38, 0.06)", "rgba(255, 255, 255, 0.96)", "#d64545",
    ]),
    ("lavender", "Levanduľa", "Jemná fialová svetlá téma", false, [
        "#f8f6fc", "#2a2438", "#7a718a", "rgba(42, 36, 56, 0.09)", "rgba(242, 237, 252, 0.92)", "#f2edfc", "rgba(248, 246, 252, 0.94)", "rgba(124, 92, 191, 0.16)", "#7c5cbf", "rgba(42, 36, 56, 0.04)", "rgba(42, 36, 56, 0.06)", "rgba(255, 255, 255, 0.96)", "#d64545",
    ]),
    ("solar", "Slnko", "Teplá svetlá téma inšpirovaná Solarized", false, [
        "#fdf6e3", "#3c3a2a", "#7a7560", "rgba(60, 58, 42, 0.12)", "rgba(250, 244, 226, 0.92)", "#faf4e2", "rgba(253, 246, 227, 0.94)", "rgba(181, 137, 0, 0.18)", "#b58900", "rgba(60, 58, 42, 0.05)", "rgba(60, 58, 42, 0.08)", "rgba(255, 252, 244, 0.96)", "#dc322f",
    ]),
    ("ocean", "Oceán", "Hlboká modrozelená nočná téma", true, [
        "#0b1a22", "#e3f2f8", "#8aa8b8", "rgba(227, 242, 248, 0.1)", "rgba(10, 24, 32, 0.92)", "#0f2029", "rgba(11, 26, 34, 0.94)", "rgba(64, 196, 204, 0.2)", "#40c4cc", "rgba(227, 242, 248, 0.06)", "rgba(227, 242, 248, 0.08)", "rgba(14, 32, 42, 0.96)", "#ff7b7b",
    ]),
    ("dracula", "Dracula", "Fialová tmavá téma pre písanie v noci", true, [
        "#282a36", "#f8f8f2", "#a9adc0", "rgba(248, 248, 242, 0.1)", "rgba(40, 42, 54, 0.92)", "#313341", "rgba(40, 42, 54, 0.94)", "rgba(189, 147, 249, 0.22)", "#bd93f9", "rgba(248, 248, 242, 0.06)", "rgba(248, 248, 242, 0.08)", "rgba(49, 51, 65, 0.96)", "#ff5555",
    ]),
    ("coffee", "Káva", "Teplá hnedá tmavá téma", true, [
        "#1c1410", "#f2e8df", "#a89488", "rgba(242, 232, 223, 0.1)", "rgba(28, 20, 16, 0.92)", "#241a15", "rgba(28, 20, 16, 0.94)", "rgba(196, 137, 90, 0.22)", "#c4895a", "rgba(242, 232, 223, 0.06)", "rgba(242, 232, 223, 0.08)", "rgba(36, 26, 20, 0.96)", "#e07070",
    ]),
    ("grape", "Hrozno", "Sýta fialová tmavá téma", true, [
        "#1a1224", "#efe8f8", "#a89bb8", "rgba(239, 232, 248, 0.1)", "rgba(26, 18, 36, 0.92)", "#221830", "rgba(26, 18, 36, 0.94)", "rgba(167, 108, 214, 0.22)", "#a76cd6", "rgba(239, 232, 248, 0.06)", "rgba(239, 232, 248, 0.08)", "rgba(34, 24, 48, 0.96)", "#ff6b8a",
    ]),
    ("slate", "Bridlica", "Neutrálna tmavosivá profesionálna téma", true, [
        "#1c1f24", "#e8eaed", "#9aa3ad", "rgba(232, 234, 237, 0.1)", "rgba(28, 31, 36, 0.92)", "#24282e", "rgba(28, 31, 36, 0.94)", "rgba(120, 144, 156, 0.22)", "#78909c", "rgba(232, 234, 237, 0.06)", "rgba(232, 234, 237, 0.08)", "rgba(36, 40, 46, 0.96)", "#ef5350",
    ]),
    ("cherry", "Čerešňa", "Tmavá červená téma s teplým akcentom", true, [
        "#1a0f12", "#f8ecee", "#b8929a", "rgba(248, 236, 238, 0.1)", "rgba(26, 15, 18, 0.92)", "#241418", "rgba(26, 15, 18, 0.94)", "rgba(224, 82, 102, 0.22)", "#e05266", "rgba(248, 236, 238, 0.06)", "rgba(248, 236, 238, 0.08)", "rgba(36, 20, 24, 0.96)", "#ff6b7a",
    ]),
    ("arctic", "Arktická", "Ľadovo modrá svetlá téma", false, [
        "#f0f7fc", "#142432", "#5a7284", "rgba(20, 36, 50, 0.09)", "rgba(224, 238, 248, 0.92)", "#e0eef8", "rgba(240, 247, 252, 0.94)", "rgba(46, 134, 193, 0.16)", "#2e86c1", "rgba(20, 36, 50, 0.04)", "rgba(20, 36, 50, 0.06)", "rgba(255, 255, 255, 0.96)", "#d64545",
    ]),
    ("sandstorm", "Púšť", "Teplá piesková svetlá téma", false, [
        "#f5efe4", "#3a3228", "#8a7d6c", "rgba(58, 50, 40, 0.11)", "rgba(237, 228, 214, 0.92)", "#ede4d6", "rgba(245, 239, 228, 0.94)", "rgba(196, 145, 74, 0.18)", "#c4914a", "rgba(58, 50, 40, 0.05)", "rgba(58, 50, 40, 0.08)", "rgba(252, 248, 240, 0.96)", "#c0392b",
    ]),
    ("neon", "Neón", "Cyberpunk tmavá téma s jasným akcentom", true, [
        "#0a0e14", "#e8f4f0", "#7a9a90", "rgba(232, 244, 240, 0.1)", "rgba(10, 14, 20, 0.92)", "#121820", "rgba(10, 14, 20, 0.94)", "rgba(0, 255, 170, 0.18)", "#00ffaa", "rgba(232, 244, 240, 0.06)", "rgba(232, 244, 240, 0.08)", "rgba(18, 24, 32, 0.96)", "#ff4466",
    ]),
    ("graphite", "Grafit", "Vysoký kontrast čiernobiela téma", true, [
        "#0d0d0d", "#f0f0f0", "#888888", "rgba(240, 240, 240, 0.12)", "rgba(13, 13, 13, 0.94)", "#161616", "rgba(13, 13, 13, 0.96)", "rgba(255, 255, 255, 0.14)", "#ffffff", "rgba(240, 240, 240, 0.06)", "rgba(240, 240, 240, 0.1)", "rgba(22, 22, 22, 0.98)", "#ff4444",
    ]),
    ("peach", "Broskyňa", "Jemná broskyňová svetlá téma", false, [
        "#fff6f0", "#3a2820", "#9a7a6a", "rgba(58, 40, 32, 0.09)", "rgba(255, 236, 224, 0.92)", "#ffece0", "rgba(255, 246, 240, 0.94)", "rgba(255, 140, 90, 0.18)", "#ff8c5a", "rgba(58, 40, 32, 0.04)", "rgba(58, 40, 32, 0.06)", "rgba(255, 255, 255, 0.96)", "#e04545",
    ]),
    ("cobalt", "Kobalt", "Sýta modrá tmavá téma", true, [
        "#0a1628", "#e8f0fa", "#8aa0c0", "rgba(232, 240, 250, 0.1)", "rgba(10, 22, 40, 0.92)", "#0f1e38", "rgba(10, 22, 40, 0.94)", "rgba(66, 133, 244, 0.22)", "#4285f4", "rgba(232, 240, 250, 0.06)", "rgba(232, 240, 250, 0.08)", "rgba(14, 28, 50, 0.96)", "#ff6b6b",
    ]),
    ("ember", "Uhlie", "Teplá oranžovo-čierna nočná téma", true, [
        "#14100c", "#f5ebe0", "#a89480", "rgba(245, 235, 224, 0.1)", "rgba(20, 16, 12, 0.92)", "#1c1610", "rgba(20, 16, 12, 0.94)", "rgba(255, 120, 50, 0.22)", "#ff7832", "rgba(245, 235, 224, 0.06)", "rgba(245, 235, 224, 0.08)", "rgba(28, 22, 16, 0.96)", "#ff5544",
    ]),
    ("jade", "Jadeit", "Hlboká smaragdovo zelená téma", true, [
        "#0f1a16", "#e6f4ef", "#8fb5a8", "rgba(230, 244, 239, 0.1)", "rgba(15, 26, 22, 0.92)", "#152620", "rgba(15, 26, 22, 0.94)", "rgba(52, 199, 140, 0.2)", "#34c78c", "rgba(230, 244, 239, 0.06)", "rgba(230, 244, 239, 0.08)", "rgba(20, 34, 28, 0.96)", "#ff6b6b",
    ]),
    ("plum", "Slivka", "Jemná fialovo ružová svetlá téma", false, [
        "#faf5fb", "#2e2234", "#877792", "rgba(46, 34, 52, 0.09)", "rgba(244, 234, 248, 0.92)", "#f4eaf8", "rgba(250, 245, 251, 0.94)", "rgba(156, 96, 176, 0.16)", "#9c60b0", "rgba(46, 34, 52, 0.04)", "rgba(46, 34, 52, 0.06)", "rgba(255, 255, 255, 0.96)", "#d64545",
    ]),
    ("storm", "Búrka", "Studená modro-sivá profesionálna téma", true, [
        "#151b24", "#e8edf5", "#93a3b8", "rgba(232, 237, 245, 0.1)", "rgba(21, 27, 36, 0.92)", "#1c2430", "rgba(21, 27, 36, 0.94)", "rgba(100, 149, 237, 0.2)", "#6495ed", "rgba(232, 237, 245, 0.06)", "rgba(232, 237, 245, 0.08)", "rgba(28, 36, 48, 0.96)", "#ef5350",
    ]),
    ("honey", "Med", "Teplá medovo zlatá svetlá téma", false, [
        "#fff9eb", "#3a2e18", "#8a7550", "rgba(58, 46, 24, 0.1)", "rgba(255, 242, 210, 0.92)", "#fff2d2", "rgba(255, 249, 235, 0.94)", "rgba(230, 168, 40, 0.18)", "#e6a828", "rgba(58, 46, 24, 0.04)", "rgba(58, 46, 24, 0.07)", "rgba(255, 255, 255, 0.96)", "#c0392b",
    ]),
    ("ink", "Atrament", "Tmavomodrá téma pre dlhé písanie", true, [
        "#0c1220", "#e4eaf8", "#8a9ab8", "rgba(228, 234, 248, 0.1)", "rgba(12, 18, 32, 0.92)", "#121a2c", "rgba(12, 18, 32, 0.94)", "rgba(72, 118, 255, 0.22)", "#4876ff", "rgba(228, 234, 248, 0.06)", "rgba(228, 234, 248, 0.08)", "rgba(18, 26, 44, 0.96)", "#ff6b6b",
    ]),
    ("coral", "Koral", "Svetlá koralovo oranžová téma", false, [
        "#fff5f0", "#3a2418", "#9a7060", "rgba(58, 36, 24, 0.09)", "rgba(255, 232, 220, 0.92)", "#ffe8dc", "rgba(255, 245, 240, 0.94)", "rgba(255, 112, 72, 0.18)", "#ff7048", "rgba(58, 36, 24, 0.04)", "rgba(58, 36, 24, 0.06)", "rgba(255, 255, 255, 0.96)", "#e04545",
    ]),
    ("sage", "Šalvaj", "Neutrálna zelenosivá svetlá téma", false, [
        "#f5f7f4", "#243028", "#667668", "rgba(36, 48, 40, 0.09)", "rgba(236, 242, 236, 0.92)", "#ecf2ec", "rgba(245, 247, 244, 0.94)", "rgba(96, 140, 104, 0.16)", "#608c68", "rgba(36, 48, 40, 0.04)", "rgba(36, 48, 40, 0.06)", "rgba(255, 255, 255, 0.96)", "#d64545",
    ]),
    ("twilight", "Súmrak", "Fialovo modrá večerná téma", true, [
        "#18122b", "#ece8f8", "#a89cc0", "rgba(236, 232, 248, 0.1)", "rgba(24, 18, 43, 0.92)", "#221838", "rgba(24, 18, 43, 0.94)", "rgba(147, 112, 219, 0.22)", "#9370db", "rgba(236, 232, 248, 0.06)", "rgba(236, 232, 248, 0.08)", "rgba(32, 24, 56, 0.96)", "#ff6b8a",
    ]),
];

fn colors_from(c: &[&str; 13]) -> ThemeColors {
    ThemeColors {
        background: c[0].into(),
        foreground: c[1].into(),
        muted_foreground: c[2].into(),
        border: c[3].into(),
        sidebar: c[4].into(),
        sidebar_solid: c[5].into(),
        toolbar: c[6].into(),
        selection: c[7].into(),
        selection_strong: c[8].into(),
        hover: c[9].into(),
        separator: c[10].into(),
        format_bar: c[11].into(),
        destructive: c[12].into(),
    }
}

pub fn theme_presets() -> Vec<ThemePreset> {
    PRESET_ROWS
        .iter()
        .map(|(id, name, description, dark, colors)| ThemePreset {
            id: (*id).into(),
            name: (*name).into(),
            description: (*description).into(),
            color_scheme: if *dark { ThemeColorScheme::Dark } else { ThemeColorScheme::Light },
            colors: colors_from(colors),
        })
        .collect()
}

pub fn theme_preset_ids() -> Vec<String> {
    PRESET_ROWS.iter().map(|row| row.0.to_string()).collect()
}

pub fn get_preset_by_id(id: &str) -> Option<ThemePreset> {
    PRESET_ROWS.iter().find(|row| row.0 == id).map(|(id, name, description, dark, colors)| ThemePreset {
        id: (*id).into(),
        name: (*name).into(),
        description: (*description).into(),
        color_scheme: if *dark { ThemeColorScheme::Dark } else { ThemeColorScheme::Light },
        colors: colors_from(colors),
    })
}

pub fn is_theme_id(id: &str) -> bool {
    id == THEME_ID_SYSTEM || id == THEME_ID_CUSTOM || PRESET_ROWS.iter().any(|row| row.0 == id)
}

/// Light preset colors (Grove) used as the starting point for custom themes.
pub fn default_custom_theme() -> ThemeColors {
    colors_from(&PRESET_ROWS[0].4)
}

/// Next theme id in the cycle order; unknown ids restart at the first entry.
pub fn next_cycle_theme(current: &str) -> &'static str {
    match CYCLE_THEME_ORDER.iter().position(|id| *id == current) {
        Some(i) => CYCLE_THEME_ORDER[(i + 1) % CYCLE_THEME_ORDER.len()],
        None => CYCLE_THEME_ORDER[0],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_all_presets_with_unique_ids() {
        let ids = theme_preset_ids();
        assert_eq!(ids.len(), 33);
        let mut sorted = ids.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), ids.len());
    }

    #[test]
    fn cycle_order_covers_presets_except_blotter() {
        for id in CYCLE_THEME_ORDER {
            assert!(*id == "system" || get_preset_by_id(id).is_some(), "{id}");
        }
        assert!(get_preset_by_id("blotter").is_some());
    }

    #[test]
    fn light_preset_matches_default_custom() {
        let light = get_preset_by_id("light").unwrap();
        assert_eq!(light.colors, default_custom_theme());
        assert_eq!(light.colors.selection_strong, "#3f7a5a");
        assert_eq!(light.color_scheme, ThemeColorScheme::Light);
    }

    #[test]
    fn cycle_wraps() {
        assert_eq!(next_cycle_theme("system"), "light");
        assert_eq!(next_cycle_theme("twilight"), "system");
        assert_eq!(next_cycle_theme("nope"), "system");
    }

    #[test]
    fn serializes_camel_case() {
        let json = serde_json::to_value(default_custom_theme()).unwrap();
        assert!(json.get("mutedForeground").is_some());
        assert!(json.get("sidebarSolid").is_some());
        let settings = ThemeSettings { theme_id: "dark".into(), custom_theme: None };
        assert_eq!(serde_json::to_string(&settings).unwrap(), r#"{"themeId":"dark"}"#);
    }

    #[test]
    fn theme_id_validation() {
        assert!(is_theme_id("system"));
        assert!(is_theme_id("custom"));
        assert!(is_theme_id("nord"));
        assert!(!is_theme_id("bogus"));
    }
}
