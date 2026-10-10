//! App route path catalog (TanStack route objects stay FE).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RoutePaths {
    pub home: String,
    pub document: String,
    pub docs: String,
    pub graph: String,
    pub plugins: String,
    pub storage_mode: String,
    pub settings_prefix: String,
}

pub fn route_paths() -> RoutePaths {
    RoutePaths {
        home: "/".into(),
        document: "/doc/$documentId".into(),
        docs: "/docs".into(),
        graph: "/graph".into(),
        plugins: "/plugins".into(),
        storage_mode: "/storage".into(),
        settings_prefix: "/settings".into(),
    }
}

pub fn settings_path(section: &str) -> String {
    format!("/settings/{section}")
}

pub fn document_path(document_id: &str) -> String {
    format!("/doc/{document_id}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings() {
        assert_eq!(settings_path("about"), "/settings/about");
        assert_eq!(route_paths().home, "/");
    }
}
