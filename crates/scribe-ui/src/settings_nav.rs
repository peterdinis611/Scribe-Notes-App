//! Settings section ids shared with the FE router.

use serde::{Deserialize, Serialize};
use strum::{EnumIter, IntoEnumIterator};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, EnumIter)]
#[serde(rename_all = "camelCase")]
pub enum SettingsSection {
    Appearance,
    Interface,
    Storage,
    Shortcuts,
    Diagnostics,
    Mcp,
    Nlp,
    Agent,
    Capture,
    Privacy,
    About,
}

impl SettingsSection {
    pub fn as_id(self) -> &'static str {
        match self {
            Self::Appearance => "appearance",
            Self::Interface => "interface",
            Self::Storage => "storage",
            Self::Shortcuts => "shortcuts",
            Self::Diagnostics => "diagnostics",
            Self::Mcp => "mcp",
            Self::Nlp => "nlp",
            Self::Agent => "agent",
            Self::Capture => "capture",
            Self::Privacy => "privacy",
            Self::About => "about",
        }
    }

    pub fn parse_id(value: &str) -> Option<Self> {
        match value {
            "appearance" => Some(Self::Appearance),
            "interface" => Some(Self::Interface),
            "storage" => Some(Self::Storage),
            "shortcuts" => Some(Self::Shortcuts),
            "diagnostics" => Some(Self::Diagnostics),
            "mcp" => Some(Self::Mcp),
            "nlp" => Some(Self::Nlp),
            "agent" => Some(Self::Agent),
            "capture" => Some(Self::Capture),
            "privacy" => Some(Self::Privacy),
            "about" => Some(Self::About),
            _ => None,
        }
    }
}

pub fn is_settings_section(value: &str) -> bool {
    SettingsSection::parse_id(value).is_some()
}

pub fn settings_section_ids() -> Vec<String> {
    SettingsSection::iter()
        .map(|section| section.as_id().to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_sections() {
        assert!(is_settings_section("agent"));
        assert!(is_settings_section("nlp"));
        assert!(!is_settings_section("audit"));
        assert_eq!(settings_section_ids().len(), 11);
    }
}
