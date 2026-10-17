//! UI skin ids shared with the FE chrome.

use serde::{Deserialize, Serialize};
use strum::{EnumIter, IntoEnumIterator};

pub const UI_SKIN_STORAGE_KEY: &str = "scribe-ui-skin";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, EnumIter)]
#[serde(rename_all = "camelCase")]
pub enum UiSkin {
    Page,
    Grove,
    Classic,
}

impl UiSkin {
    pub fn as_id(self) -> &'static str {
        match self {
            Self::Page => "page",
            Self::Grove => "grove",
            Self::Classic => "classic",
        }
    }

    pub fn parse_id(value: &str) -> Option<Self> {
        match value {
            "page" => Some(Self::Page),
            "grove" => Some(Self::Grove),
            "classic" => Some(Self::Classic),
            _ => None,
        }
    }
}

pub fn is_ui_skin(value: &str) -> bool {
    UiSkin::parse_id(value).is_some()
}

/// Normalize legacy Copper Press / unknown values to Page.
pub fn normalize_ui_skin(value: &str) -> UiSkin {
    match value {
        "classic" => UiSkin::Classic,
        "grove" | "press" => UiSkin::Grove,
        "page" => UiSkin::Page,
        _ => UiSkin::Page,
    }
}

pub fn ui_skin_ids() -> Vec<String> {
    UiSkin::iter().map(|s| s.as_id().to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_legacy_and_default() {
        assert_eq!(normalize_ui_skin("press"), UiSkin::Grove);
        assert_eq!(normalize_ui_skin("classic"), UiSkin::Classic);
        assert_eq!(normalize_ui_skin("page"), UiSkin::Page);
        assert_eq!(normalize_ui_skin("nope"), UiSkin::Page);
        assert!(is_ui_skin("page"));
        assert!(is_ui_skin("grove"));
        assert!(!is_ui_skin("press"));
    }
}
