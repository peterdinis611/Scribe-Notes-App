//! First-party plugin preset catalogs.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginPreset {
    pub id: String,
    pub plugin_ids: Vec<String>,
}

pub fn plugin_presets() -> Vec<PluginPreset> {
    vec![
        PluginPreset {
            id: "writing".into(),
            plugin_ids: vec![
                "scribe.daily-journal".into(),
                "scribe.meeting-wrap".into(),
                "scribe.plaintext-export".into(),
            ],
        },
        PluginPreset {
            id: "study".into(),
            plugin_ids: vec!["scribe.flashcards".into(), "scribe.citation-pack".into()],
        },
        PluginPreset {
            id: "workspace".into(),
            plugin_ids: vec!["scribe.status-meta".into(), "scribe.theme-pack".into()],
        },
        PluginPreset {
            id: "all".into(),
            plugin_ids: vec![
                "scribe.daily-journal".into(),
                "scribe.meeting-wrap".into(),
                "scribe.plaintext-export".into(),
                "scribe.flashcards".into(),
                "scribe.citation-pack".into(),
                "scribe.status-meta".into(),
                "scribe.theme-pack".into(),
                "scribe.standup".into(),
            ],
        },
    ]
}

pub fn plugin_preset_ids() -> Vec<String> {
    plugin_presets().into_iter().map(|p| p.id).collect()
}

pub fn category_for_plugin_id(plugin_id: &str) -> &'static str {
    for preset in plugin_presets() {
        if preset.plugin_ids.iter().any(|id| id == plugin_id) {
            return match preset.id.as_str() {
                "writing" => "writing",
                "study" => "study",
                "workspace" => "workspace",
                _ => "other",
            };
        }
    }
    "other"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn categories() {
        assert_eq!(category_for_plugin_id("scribe.flashcards"), "study");
        assert_eq!(plugin_preset_ids().len(), 4);
    }
}
