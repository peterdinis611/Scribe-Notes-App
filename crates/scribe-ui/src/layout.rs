//! Sidebar / panel width clamp math (FE layout helpers).

pub const SIDEBAR_WIDTH_DEFAULT: i32 = 300;
pub const SIDEBAR_WIDTH_MIN: i32 = 240;
pub const SIDEBAR_WIDTH_MAX: i32 = 640;
pub const SIDEBAR_RAIL_WIDTH: i32 = 52;

pub const EDITOR_PANEL_WIDTH_DEFAULT: i32 = 320;
pub const EDITOR_PANEL_WIDTH_MIN: i32 = 240;
pub const EDITOR_PANEL_WIDTH_MAX: i32 = 720;
pub const EDITOR_PANEL_RAIL_WIDTH: i32 = 52;
pub const EDITOR_CONTENT_MIN: i32 = 380;
pub const LIBRARY_IN_FLOW_MIN_WIDTH: i32 = 1280;
const WIDTH_SNAP_PX: i32 = 12;

pub fn clamp_sidebar_width(value: f64, viewport_width: i32) -> i32 {
    let room = (viewport_width - SIDEBAR_RAIL_WIDTH - 420).max(SIDEBAR_WIDTH_MIN);
    let max = SIDEBAR_WIDTH_MAX.min(room);
    if !value.is_finite() {
        return SIDEBAR_WIDTH_DEFAULT;
    }
    (value.round() as i32).clamp(SIDEBAR_WIDTH_MIN, max)
}

fn occupied_library_width(viewport_width: i32, sidebar_width: i32) -> i32 {
    if viewport_width < LIBRARY_IN_FLOW_MIN_WIDTH {
        0
    } else {
        SIDEBAR_RAIL_WIDTH + sidebar_width
    }
}

pub fn clamp_editor_panel_width(
    value: f64,
    viewport_width: i32,
    sidebar_width: i32,
    min_width: i32,
) -> i32 {
    let occupied_left = occupied_library_width(viewport_width, sidebar_width);
    let room = (viewport_width - EDITOR_PANEL_RAIL_WIDTH - occupied_left - EDITOR_CONTENT_MIN)
        .max(min_width);
    let max = EDITOR_PANEL_WIDTH_MAX.min(room);
    let min = min_width.min(max);
    if !value.is_finite() {
        return EDITOR_PANEL_WIDTH_DEFAULT.clamp(min, max);
    }
    (value.round() as i32).clamp(min, max)
}

pub fn next_editor_panel_width_on_double_click(
    current: i32,
    viewport_width: i32,
    sidebar_width: i32,
    min_width: i32,
) -> i32 {
    let max = clamp_editor_panel_width(
        EDITOR_PANEL_WIDTH_MAX as f64,
        viewport_width,
        sidebar_width,
        min_width,
    );
    let def = clamp_editor_panel_width(
        EDITOR_PANEL_WIDTH_DEFAULT as f64,
        viewport_width,
        sidebar_width,
        min_width,
    );
    if (current - max).abs() > WIDTH_SNAP_PX {
        max
    } else {
        def
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_sidebar() {
        assert_eq!(clamp_sidebar_width(100.0, 1440), SIDEBAR_WIDTH_MIN);
        assert_eq!(clamp_sidebar_width(900.0, 1440), SIDEBAR_WIDTH_MAX);
        assert_eq!(clamp_sidebar_width(320.0, 1440), 320);
    }
}
