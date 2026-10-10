//! OS-global shortcut ids + accelerator mapping.

pub const GLOBAL_SHORTCUT_IDS: &[&str] = &["quickNote", "todayNote"];

pub fn global_shortcut_ids() -> Vec<String> {
    GLOBAL_SHORTCUT_IDS.iter().map(|s| (*s).to_string()).collect()
}

/// Convert app hotkey (`Mod+Shift+N`) → Tauri global format (`CommandOrControl+Shift+N`).
pub fn to_global_shortcut_accelerator(hotkey: &str) -> String {
    hotkey
        .split('+')
        .map(|part| {
            let key = part.trim();
            match key {
                "Mod" => "CommandOrControl".into(),
                "Meta" => "Super".into(),
                "Ctrl" => "Control".into(),
                "Alt" => "Alt".into(),
                "Shift" => "Shift".into(),
                other if other.len() == 1 => other.to_uppercase(),
                other => other.to_string(),
            }
        })
        .collect::<Vec<_>>()
        .join("+")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_mod() {
        assert_eq!(
            to_global_shortcut_accelerator("Mod+Shift+N"),
            "CommandOrControl+Shift+N"
        );
    }
}
