//! App shortcut binding catalog + hotkey display helpers.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppShortcutBinding {
    pub id: String,
    pub scope: String,
    pub default_hotkey: String,
    pub label_key: String,
    pub description_key: String,
}

fn binding(
    id: &str,
    default_hotkey: &str,
    label_key: &str,
    description_key: &str,
) -> AppShortcutBinding {
    AppShortcutBinding {
        id: id.into(),
        scope: "app".into(),
        default_hotkey: default_hotkey.into(),
        label_key: label_key.into(),
        description_key: description_key.into(),
    }
}

pub fn app_shortcut_bindings() -> Vec<AppShortcutBinding> {
    vec![
        binding("commandPalette", "Mod+K", "shortcuts.commandPalette.label", "shortcuts.commandPalette.description"),
        binding("link", "Mod+Shift+K", "shortcuts.link.label", "shortcuts.link.description"),
        binding("newDocument", "Mod+N", "shortcuts.newDocument.label", "shortcuts.newDocument.description"),
        binding("quickNote", "Mod+Shift+N", "shortcuts.quickNote.label", "shortcuts.quickNote.description"),
        binding("todayNote", "Mod+Shift+D", "shortcuts.todayNote.label", "shortcuts.todayNote.description"),
        binding("save", "Mod+S", "shortcuts.save.label", "shortcuts.save.description"),
        binding("import", "Mod+O", "shortcuts.import.label", "shortcuts.import.description"),
        binding("toggleTheme", "Mod+Shift+L", "shortcuts.toggleTheme.label", "shortcuts.toggleTheme.description"),
        binding("settings", "Mod+,", "shortcuts.settings.label", "shortcuts.settings.description"),
        binding("focusMode", "Mod+Shift+F", "shortcuts.focusMode.label", "shortcuts.focusMode.description"),
        binding("readingMode", "Mod+Shift+R", "shortcuts.readingMode.label", "shortcuts.readingMode.description"),
        binding("closeTab", "Mod+W", "shortcuts.closeTab.label", "shortcuts.closeTab.description"),
        binding("reopenClosedTab", "Mod+Shift+T", "shortcuts.reopenClosedTab.label", "shortcuts.reopenClosedTab.description"),
        binding("libraryFindReplace", "Mod+Shift+H", "shortcuts.libraryFindReplace.label", "shortcuts.libraryFindReplace.description"),
        binding("clipboardHistory", "Mod+Shift+V", "shortcuts.clipboardHistory.label", "shortcuts.clipboardHistory.description"),
        binding("connections", "Mod+Shift+B", "shortcuts.connections.label", "shortcuts.connections.description"),
        binding("askThisNote", "Mod+Shift+A", "shortcuts.askThisNote.label", "shortcuts.askThisNote.description"),
    ]
}

pub fn shortcut_ids() -> Vec<String> {
    app_shortcut_bindings()
        .into_iter()
        .map(|b| b.id)
        .collect()
}

pub fn get_resolved_hotkey(id: &str, overrides: &[(String, String)]) -> String {
    if let Some((_, value)) = overrides.iter().find(|(k, _)| k == id) {
        return value.clone();
    }
    app_shortcut_bindings()
        .into_iter()
        .find(|b| b.id == id)
        .map(|b| b.default_hotkey)
        .unwrap_or_default()
}

pub fn hotkey_to_display_keys(hotkey: &str) -> Vec<String> {
    hotkey
        .split('+')
        .map(|part| match part {
            "Mod" => "⌘".into(),
            "Shift" => "⇧".into(),
            "Alt" => "⌥".into(),
            "Control" => "⌃".into(),
            other if other.len() == 1 => other.to_uppercase(),
            other => other.to_string(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_keys() {
        assert_eq!(
            hotkey_to_display_keys("Mod+Shift+K"),
            vec!["⌘".to_string(), "⇧".to_string(), "K".to_string()]
        );
        assert!(!shortcut_ids().is_empty());
    }
}
