//! App version chrome — synced via `CARGO_PKG_VERSION` + `version:check`.

pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Major.minor for “Scribe 3.4” chrome.
pub fn short_version() -> String {
    short_version_of(APP_VERSION)
}

pub fn short_version_of(version: &str) -> String {
    let parts: Vec<&str> = version.split('.').collect();
    match parts.as_slice() {
        [major, minor, ..] => format!("{major}.{minor}"),
        [major] => (*major).to_string(),
        [] => version.to_string(),
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppVersionInfo {
    pub version: String,
    pub short_version: String,
}

pub fn app_version_info() -> AppVersionInfo {
    AppVersionInfo {
        version: APP_VERSION.to_string(),
        short_version: short_version(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_version_trims_patch() {
        assert_eq!(short_version_of("3.4.0"), "3.4");
        assert_eq!(short_version_of("1.0"), "1.0");
    }
}
