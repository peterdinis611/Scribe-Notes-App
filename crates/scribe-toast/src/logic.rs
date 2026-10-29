use crate::settings::{ToastSettings, ToastStackBehavior};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToastVariant {
    Default,
    Success,
    Error,
    Info,
}

impl ToastVariant {
    pub fn parse(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "success" => Self::Success,
            "error" => Self::Error,
            "info" => Self::Info,
            _ => Self::Default,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToastRecord {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub variant: ToastVariant,
    pub action_label: Option<String>,
}

/// Resolve auto-dismiss duration (0 = sticky until manual dismiss).
pub fn resolve_duration(
    settings: &ToastSettings,
    has_action: bool,
    override_ms: Option<u32>,
) -> u32 {
    if let Some(ms) = override_ms {
        return ms;
    }
    if has_action {
        settings.duration_with_action_ms
    } else {
        settings.duration_ms
    }
}

pub fn should_show_variant(settings: &ToastSettings, variant: ToastVariant) -> bool {
    if !settings.enabled {
        return false;
    }
    match variant {
        ToastVariant::Success => settings.show_success,
        ToastVariant::Error => settings.show_error,
        ToastVariant::Info => settings.show_info,
        ToastVariant::Default => settings.show_default,
    }
}

/// Host CSS helper for corner placement.
pub fn position_class(settings: &ToastSettings) -> &'static str {
    match settings.position {
        crate::settings::ToastPosition::BottomRight => "toast-host--bottom-right",
        crate::settings::ToastPosition::BottomLeft => "toast-host--bottom-left",
        crate::settings::ToastPosition::TopRight => "toast-host--top-right",
        crate::settings::ToastPosition::TopLeft => "toast-host--top-left",
    }
}

/// Insert `incoming` into the stack according to settings. Returns the new list.
pub fn apply_stack(existing: &[ToastRecord], incoming: ToastRecord, settings: &ToastSettings) -> Vec<ToastRecord> {
    let max = settings.max_visible.max(1) as usize;
    let mut next = existing.to_vec();

    match settings.stack_behavior {
        ToastStackBehavior::ReplaceSame => {
            if let Some(idx) = next.iter().position(|t| t.title == incoming.title) {
                next[idx] = incoming;
                return next;
            }
            next.push(incoming);
            while next.len() > max {
                next.remove(0);
            }
            next
        }
        ToastStackBehavior::DropNewest => {
            if next.len() >= max {
                return next;
            }
            next.push(incoming);
            next
        }
        ToastStackBehavior::DropOldest => {
            next.push(incoming);
            while next.len() > max {
                next.remove(0);
            }
            next
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::ToastSettings;

    fn sample(id: &str, title: &str) -> ToastRecord {
        ToastRecord {
            id: id.into(),
            title: title.into(),
            description: None,
            variant: ToastVariant::Info,
            action_label: None,
        }
    }

    #[test]
    fn drop_oldest_trims() {
        let settings = ToastSettings {
            max_visible: 2,
            stack_behavior: ToastStackBehavior::DropOldest,
            ..ToastSettings::default()
        };
        let stack = apply_stack(&[sample("1", "a"), sample("2", "b")], sample("3", "c"), &settings);
        assert_eq!(stack.len(), 2);
        assert_eq!(stack[0].id, "2");
        assert_eq!(stack[1].id, "3");
    }

    #[test]
    fn drop_newest_rejects() {
        let settings = ToastSettings {
            max_visible: 1,
            stack_behavior: ToastStackBehavior::DropNewest,
            ..ToastSettings::default()
        };
        let stack = apply_stack(&[sample("1", "a")], sample("2", "b"), &settings);
        assert_eq!(stack.len(), 1);
        assert_eq!(stack[0].id, "1");
    }

    #[test]
    fn replace_same_title() {
        let settings = ToastSettings {
            stack_behavior: ToastStackBehavior::ReplaceSame,
            ..ToastSettings::default()
        };
        let stack = apply_stack(&[sample("1", "Saved")], sample("2", "Saved"), &settings);
        assert_eq!(stack.len(), 1);
        assert_eq!(stack[0].id, "2");
    }

    #[test]
    fn muted_variant() {
        let settings = ToastSettings {
            show_success: false,
            ..ToastSettings::default()
        };
        assert!(!should_show_variant(&settings, ToastVariant::Success));
        assert!(should_show_variant(&settings, ToastVariant::Error));
    }
}
