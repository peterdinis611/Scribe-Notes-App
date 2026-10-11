//! Panel-width storage keys, TOC rail clamp and raw-value readers
//! (`src/lib/layout/editor-panel-width.ts`, `sidebar-width.ts`).
//!
//! The sidebar and editor-panel clamp / double-click math already lives in `layout`; this
//! module adds what it lacks: storage keys, CSS variable names, the TOC rail, shared "room"
//! helpers, and `read_*` helpers that turn a raw stored string into a clamped width.
//! DOM writes (`document.documentElement.style`) and `kv` storage stay in the frontend.

use crate::layout::{
    clamp_editor_panel_width, clamp_sidebar_width, EDITOR_CONTENT_MIN, EDITOR_PANEL_RAIL_WIDTH,
    EDITOR_PANEL_WIDTH_DEFAULT, EDITOR_PANEL_WIDTH_MIN, LIBRARY_IN_FLOW_MIN_WIDTH,
    SIDEBAR_RAIL_WIDTH, SIDEBAR_WIDTH_DEFAULT,
};

pub const SIDEBAR_WIDTH_KEY: &str = "scribe-sidebar-width";
pub const EDITOR_PANEL_WIDTH_KEY: &str = "scribe-editor-panel-width";
pub const TOC_RAIL_WIDTH_KEY: &str = "scribe-toc-rail-width";

pub const SIDEBAR_WIDTH_CSS_VAR: &str = "--sidebar-width";
pub const EDITOR_PANEL_WIDTH_CSS_VAR: &str = "--editor-panel-width";
pub const TOC_RAIL_WIDTH_CSS_VAR: &str = "--editor-toc-width";

pub const TOC_RAIL_WIDTH_DEFAULT: i32 = 200;
pub const TOC_RAIL_WIDTH_MIN: i32 = 160;
pub const TOC_RAIL_WIDTH_MAX: i32 = 360;

/// Viewport width assumed when no window is available (SSR / tests).
pub const DEFAULT_VIEWPORT_WIDTH: i32 = 1440;

/// Width taken by the library (rail + sidebar) when it sits in the layout flow; `0` below
/// the `xl` breakpoint where the library is an overlay drawer.
pub fn occupied_library_width(viewport_width: i32, sidebar_width: i32) -> i32 {
    if viewport_width < LIBRARY_IN_FLOW_MIN_WIDTH {
        0
    } else {
        SIDEBAR_RAIL_WIDTH + sidebar_width
    }
}

/// Horizontal room left for panels that sit next to the editor content.
pub fn editor_side_room(viewport_width: i32, sidebar_width: i32) -> i32 {
    viewport_width
        - EDITOR_PANEL_RAIL_WIDTH
        - occupied_library_width(viewport_width, sidebar_width)
        - EDITOR_CONTENT_MIN
}

/// Clamp the TOC rail width to `[160, min(360, room)]`; non-finite input → default (200).
pub fn clamp_toc_rail_width(value: f64, viewport_width: i32, sidebar_width: i32) -> i32 {
    let room = editor_side_room(viewport_width, sidebar_width).max(TOC_RAIL_WIDTH_MIN);
    let max = TOC_RAIL_WIDTH_MAX.min(room);
    if !value.is_finite() {
        return TOC_RAIL_WIDTH_DEFAULT;
    }
    (value.round() as i32).clamp(TOC_RAIL_WIDTH_MIN, max)
}

/// JS `Number(raw)` for stored width strings: blank → 0, unparsable → NaN.
fn js_number(raw: &str) -> f64 {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return 0.0;
    }
    trimmed.parse::<f64>().unwrap_or(f64::NAN)
}

/// Stored sidebar width (raw string from `kv`) → clamped width; missing/empty → default.
pub fn read_sidebar_width(raw: Option<&str>, viewport_width: i32) -> i32 {
    match raw.filter(|s| !s.is_empty()) {
        None => SIDEBAR_WIDTH_DEFAULT,
        Some(s) => clamp_sidebar_width(js_number(s), viewport_width),
    }
}

/// Stored editor panel width → clamped width; missing/empty → clamped default.
pub fn read_editor_panel_width(
    raw: Option<&str>,
    viewport_width: i32,
    sidebar_width: i32,
    min_width: i32,
) -> i32 {
    let value = match raw.filter(|s| !s.is_empty()) {
        None => EDITOR_PANEL_WIDTH_DEFAULT as f64,
        Some(s) => js_number(s),
    };
    clamp_editor_panel_width(value, viewport_width, sidebar_width, min_width)
}

/// Stored TOC rail width → clamped width; missing/empty → default.
pub fn read_toc_rail_width(raw: Option<&str>, viewport_width: i32, sidebar_width: i32) -> i32 {
    match raw.filter(|s| !s.is_empty()) {
        None => TOC_RAIL_WIDTH_DEFAULT,
        Some(s) => clamp_toc_rail_width(js_number(s), viewport_width, sidebar_width),
    }
}

/// `(css variable, "<n>px")` pair for `style.setProperty`.
pub fn width_css_var(name: &'static str, width: i32) -> (&'static str, String) {
    (name, format!("{width}px"))
}

/// Resolved widths for one viewport (sidebar first, since the others depend on it).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelWidths {
    pub sidebar: i32,
    pub editor_panel: i32,
    pub toc_rail: i32,
}

/// Read all three panel widths from raw stored strings for the given viewport.
pub fn resolve_panel_widths(
    viewport_width: i32,
    sidebar_raw: Option<&str>,
    editor_panel_raw: Option<&str>,
    toc_rail_raw: Option<&str>,
    editor_panel_min: i32,
) -> PanelWidths {
    let sidebar = read_sidebar_width(sidebar_raw, viewport_width);
    PanelWidths {
        sidebar,
        editor_panel: read_editor_panel_width(editor_panel_raw, viewport_width, sidebar, editor_panel_min),
        toc_rail: read_toc_rail_width(toc_rail_raw, viewport_width, sidebar),
    }
}

/// Convenience: `resolve_panel_widths` with the default editor panel minimum.
pub fn resolve_panel_widths_default(
    viewport_width: i32,
    sidebar_raw: Option<&str>,
    editor_panel_raw: Option<&str>,
    toc_rail_raw: Option<&str>,
) -> PanelWidths {
    resolve_panel_widths(viewport_width, sidebar_raw, editor_panel_raw, toc_rail_raw, EDITOR_PANEL_WIDTH_MIN)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::layout::{EDITOR_PANEL_WIDTH_MAX, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN};

    #[test]
    fn occupied_width_depends_on_breakpoint() {
        assert_eq!(occupied_library_width(1279, 300), 0);
        assert_eq!(occupied_library_width(1280, 300), 352);
    }

    #[test]
    fn toc_rail_clamps() {
        // 1440 wide, 300 sidebar: room = 1440 - 52 - 352 - 380 = 656 → max 360
        assert_eq!(clamp_toc_rail_width(999.0, 1440, 300), TOC_RAIL_WIDTH_MAX);
        assert_eq!(clamp_toc_rail_width(10.0, 1440, 300), TOC_RAIL_WIDTH_MIN);
        assert_eq!(clamp_toc_rail_width(210.4, 1440, 300), 210);
        assert_eq!(clamp_toc_rail_width(f64::NAN, 1440, 300), TOC_RAIL_WIDTH_DEFAULT);
        // Tight viewport: room = 1280 - 52 - 692 - 380 = 156, floored to the rail minimum.
        assert_eq!(clamp_toc_rail_width(999.0, 1280, 640), TOC_RAIL_WIDTH_MIN);
        // Roomy but below the cap: 1400 wide → room = 1400 - 52 - 692 - 380 = 276.
        assert_eq!(clamp_toc_rail_width(999.0, 1400, 640), 1400 - 52 - 692 - 380);
        // Overlay library: only the rail + content minimum are reserved.
        assert_eq!(clamp_toc_rail_width(999.0, 1000, 300), TOC_RAIL_WIDTH_MAX.min(1000 - 52 - 380));
    }

    #[test]
    fn room_math() {
        assert_eq!(editor_side_room(1440, 300), 1440 - 52 - 352 - 380);
        assert_eq!(editor_side_room(1000, 300), 1000 - 52 - 380);
    }

    #[test]
    fn readers_default_and_clamp() {
        assert_eq!(read_sidebar_width(None, 1440), SIDEBAR_WIDTH_DEFAULT);
        assert_eq!(read_sidebar_width(Some(""), 1440), SIDEBAR_WIDTH_DEFAULT);
        assert_eq!(read_sidebar_width(Some("9999"), 1440), SIDEBAR_WIDTH_MAX);
        assert_eq!(read_sidebar_width(Some("0"), 1440), SIDEBAR_WIDTH_MIN);
        assert_eq!(read_sidebar_width(Some("abc"), 1440), SIDEBAR_WIDTH_DEFAULT);
        assert_eq!(read_sidebar_width(Some(" 410 "), 1440), 410);

        assert_eq!(read_editor_panel_width(None, 1440, 300, EDITOR_PANEL_WIDTH_MIN), 320);
        assert_eq!(read_editor_panel_width(Some("5000"), 1440, 300, EDITOR_PANEL_WIDTH_MIN), 656);
        // Wide viewport: capped at the absolute max.
        assert_eq!(read_editor_panel_width(Some("5000"), 2400, 300, EDITOR_PANEL_WIDTH_MIN), EDITOR_PANEL_WIDTH_MAX);
        assert_eq!(read_editor_panel_width(Some("x"), 1440, 300, EDITOR_PANEL_WIDTH_MIN), 320);

        assert_eq!(read_toc_rail_width(None, 1440, 300), 200);
        assert_eq!(read_toc_rail_width(Some("1"), 1440, 300), TOC_RAIL_WIDTH_MIN);
        assert_eq!(read_toc_rail_width(Some("nope"), 1440, 300), TOC_RAIL_WIDTH_DEFAULT);
    }

    #[test]
    fn resolves_all_widths_and_serializes() {
        let w = resolve_panel_widths_default(1440, Some("320"), Some("400"), Some("250"));
        assert_eq!(w, PanelWidths { sidebar: 320, editor_panel: 400, toc_rail: 250 });
        let v = serde_json::to_value(w).unwrap();
        assert_eq!(v["editorPanel"], 400);
        assert_eq!(v["tocRail"], 250);
    }

    #[test]
    fn css_vars_and_keys() {
        assert_eq!(width_css_var(EDITOR_PANEL_WIDTH_CSS_VAR, 320), ("--editor-panel-width", "320px".to_string()));
        assert_eq!(width_css_var(TOC_RAIL_WIDTH_CSS_VAR, 200).1, "200px");
        assert_eq!(EDITOR_PANEL_WIDTH_KEY, "scribe-editor-panel-width");
    }
}
