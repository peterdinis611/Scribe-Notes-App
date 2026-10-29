use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ToastPosition {
    BottomRight,
    BottomLeft,
    TopRight,
    TopLeft,
}

impl Default for ToastPosition {
    fn default() -> Self {
        Self::BottomRight
    }
}

impl ToastPosition {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::BottomRight => "bottom-right",
            Self::BottomLeft => "bottom-left",
            Self::TopRight => "top-right",
            Self::TopLeft => "top-left",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "bottom-right" | "bottomright" => Some(Self::BottomRight),
            "bottom-left" | "bottomleft" => Some(Self::BottomLeft),
            "top-right" | "topright" => Some(Self::TopRight),
            "top-left" | "topleft" => Some(Self::TopLeft),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ToastStackBehavior {
    /// Remove the oldest toast when over capacity.
    DropOldest,
    /// Reject the newest toast when over capacity.
    DropNewest,
    /// Replace an existing toast with the same title (else drop oldest).
    ReplaceSame,
}

impl Default for ToastStackBehavior {
    fn default() -> Self {
        Self::DropOldest
    }
}

impl ToastStackBehavior {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::DropOldest => "drop-oldest",
            Self::DropNewest => "drop-newest",
            Self::ReplaceSame => "replace-same",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "drop-oldest" | "dropoldest" | "oldest" => Some(Self::DropOldest),
            "drop-newest" | "dropnewest" | "newest" => Some(Self::DropNewest),
            "replace-same" | "replacesame" | "replace" => Some(Self::ReplaceSame),
            _ => None,
        }
    }
}

/// User-tunable toast preferences. Keep in sync with FE `ToastSettings`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToastSettings {
    pub enabled: bool,
    pub position: ToastPosition,
    pub duration_ms: u32,
    pub duration_with_action_ms: u32,
    pub exit_ms: u32,
    pub max_visible: u32,
    pub stack_behavior: ToastStackBehavior,
    pub pause_on_hover: bool,
    pub show_success: bool,
    pub show_error: bool,
    pub show_info: bool,
    pub show_default: bool,
    pub respect_reduced_motion: bool,
    pub dense: bool,
}

impl Default for ToastSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            position: ToastPosition::BottomRight,
            duration_ms: 3_500,
            duration_with_action_ms: 8_000,
            exit_ms: 200,
            max_visible: 5,
            stack_behavior: ToastStackBehavior::DropOldest,
            pause_on_hover: true,
            show_success: true,
            show_error: true,
            show_info: true,
            show_default: true,
            respect_reduced_motion: true,
            dense: false,
        }
    }
}

pub fn default_toast_settings() -> ToastSettings {
    ToastSettings::default()
}

const DURATION_MIN: u32 = 800;
const DURATION_MAX: u32 = 30_000;
const EXIT_MIN: u32 = 0;
const EXIT_MAX: u32 = 1_000;
const MAX_VISIBLE_MIN: u32 = 1;
const MAX_VISIBLE_MAX: u32 = 12;

fn clamp_u32(value: u32, min: u32, max: u32) -> u32 {
    value.clamp(min, max)
}

/// Clamp / fill missing fields so settings are always safe to apply.
pub fn normalize_toast_settings(mut settings: ToastSettings) -> ToastSettings {
    settings.duration_ms = clamp_u32(settings.duration_ms, DURATION_MIN, DURATION_MAX);
    settings.duration_with_action_ms =
        clamp_u32(settings.duration_with_action_ms, DURATION_MIN, DURATION_MAX);
    if settings.duration_with_action_ms < settings.duration_ms {
        settings.duration_with_action_ms = settings.duration_ms;
    }
    settings.exit_ms = clamp_u32(settings.exit_ms, EXIT_MIN, EXIT_MAX);
    settings.max_visible = clamp_u32(settings.max_visible, MAX_VISIBLE_MIN, MAX_VISIBLE_MAX);
    settings
}

/// Parse JSON (partial allowed) into normalized settings, merging over defaults.
pub fn toast_settings_from_json(raw: &str) -> Result<ToastSettings, String> {
    let value: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("Invalid toast settings JSON: {e}"))?;
    let mut settings = ToastSettings::default();

    if let Some(v) = value.get("enabled").and_then(|x| x.as_bool()) {
        settings.enabled = v;
    }
    if let Some(v) = value.get("position").and_then(|x| x.as_str()) {
        if let Some(pos) = ToastPosition::parse(v) {
            settings.position = pos;
        }
    }
    if let Some(v) = value
        .get("durationMs")
        .or_else(|| value.get("duration_ms"))
        .and_then(|x| x.as_u64())
    {
        settings.duration_ms = v as u32;
    }
    if let Some(v) = value
        .get("durationWithActionMs")
        .or_else(|| value.get("duration_with_action_ms"))
        .and_then(|x| x.as_u64())
    {
        settings.duration_with_action_ms = v as u32;
    }
    if let Some(v) = value
        .get("exitMs")
        .or_else(|| value.get("exit_ms"))
        .and_then(|x| x.as_u64())
    {
        settings.exit_ms = v as u32;
    }
    if let Some(v) = value
        .get("maxVisible")
        .or_else(|| value.get("max_visible"))
        .and_then(|x| x.as_u64())
    {
        settings.max_visible = v as u32;
    }
    if let Some(v) = value
        .get("stackBehavior")
        .or_else(|| value.get("stack_behavior"))
        .and_then(|x| x.as_str())
    {
        if let Some(b) = ToastStackBehavior::parse(v) {
            settings.stack_behavior = b;
        }
    }
    if let Some(v) = value.get("pauseOnHover").or_else(|| value.get("pause_on_hover")).and_then(|x| x.as_bool()) {
        settings.pause_on_hover = v;
    }
    if let Some(v) = value.get("showSuccess").or_else(|| value.get("show_success")).and_then(|x| x.as_bool()) {
        settings.show_success = v;
    }
    if let Some(v) = value.get("showError").or_else(|| value.get("show_error")).and_then(|x| x.as_bool()) {
        settings.show_error = v;
    }
    if let Some(v) = value.get("showInfo").or_else(|| value.get("show_info")).and_then(|x| x.as_bool()) {
        settings.show_info = v;
    }
    if let Some(v) = value.get("showDefault").or_else(|| value.get("show_default")).and_then(|x| x.as_bool()) {
        settings.show_default = v;
    }
    if let Some(v) = value
        .get("respectReducedMotion")
        .or_else(|| value.get("respect_reduced_motion"))
        .and_then(|x| x.as_bool())
    {
        settings.respect_reduced_motion = v;
    }
    if let Some(v) = value.get("dense").and_then(|x| x.as_bool()) {
        settings.dense = v;
    }

    Ok(normalize_toast_settings(settings))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_clamps_ranges() {
        let s = normalize_toast_settings(ToastSettings {
            duration_ms: 10,
            duration_with_action_ms: 20,
            exit_ms: 9_000,
            max_visible: 99,
            ..ToastSettings::default()
        });
        assert_eq!(s.duration_ms, DURATION_MIN);
        assert!(s.duration_with_action_ms >= s.duration_ms);
        assert_eq!(s.exit_ms, EXIT_MAX);
        assert_eq!(s.max_visible, MAX_VISIBLE_MAX);
    }

    #[test]
    fn from_json_merges_partial() {
        let s = toast_settings_from_json(r#"{"enabled":false,"position":"top-left","maxVisible":3}"#)
            .unwrap();
        assert!(!s.enabled);
        assert_eq!(s.position, ToastPosition::TopLeft);
        assert_eq!(s.max_visible, 3);
        assert_eq!(s.duration_ms, 3_500);
    }
}
