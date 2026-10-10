//! Stable `data-tour` ids for the guided product tour (`src/lib/app-tour/selectors.ts`).

use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TourTarget {
    /// Key as used on the FE `TOUR` object (camelCase).
    pub key: &'static str,
    /// Value of the `data-tour` attribute.
    pub id: &'static str,
}

pub const TOUR_TARGETS: &[TourTarget] = &[
    TourTarget { key: "sidebarRail", id: "sidebar-rail" },
    TourTarget { key: "libraryPanel", id: "library-panel" },
    TourTarget { key: "librarySwitcher", id: "library-switcher" },
    TourTarget { key: "librarySearch", id: "library-search" },
    TourTarget { key: "libraryViews", id: "library-views" },
    TourTarget { key: "libraryChat", id: "library-chat" },
    TourTarget { key: "libraryFilters", id: "library-filters" },
    TourTarget { key: "libraryTree", id: "library-tree" },
    TourTarget { key: "libraryCompile", id: "library-compile" },
    TourTarget { key: "appHeader", id: "app-header" },
    TourTarget { key: "newDocument", id: "new-document" },
    TourTarget { key: "documentTabs", id: "document-tabs" },
    TourTarget { key: "editorToolbar", id: "editor-toolbar" },
    TourTarget { key: "editorCanvas", id: "editor-canvas" },
    TourTarget { key: "panelRail", id: "panel-rail" },
    TourTarget { key: "panelOutline", id: "panel-outline" },
    TourTarget { key: "panelInsights", id: "panel-insights" },
    TourTarget { key: "statusBar", id: "status-bar" },
    TourTarget { key: "settingsNav", id: "settings-nav" },
];

/// CSS selector for a tour id, e.g. `[data-tour="sidebar-rail"]`.
pub fn tour_selector_for_id(id: &str) -> String {
    format!("[data-tour=\"{id}\"]")
}

/// Selector for a FE `TOUR` key (camelCase); `None` when unknown.
pub fn tour_selector(key: &str) -> Option<String> {
    TOUR_TARGETS
        .iter()
        .find(|t| t.key == key)
        .map(|t| tour_selector_for_id(t.id))
}

pub fn tour_target_ids() -> Vec<&'static str> {
    TOUR_TARGETS.iter().map(|t| t.id).collect()
}

pub fn is_tour_id(id: &str) -> bool {
    TOUR_TARGETS.iter().any(|t| t.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selectors_match_fe() {
        assert_eq!(tour_selector("sidebarRail").unwrap(), "[data-tour=\"sidebar-rail\"]");
        assert_eq!(tour_selector("settingsNav").unwrap(), "[data-tour=\"settings-nav\"]");
        assert!(tour_selector("nope").is_none());
    }

    #[test]
    fn ids_unique() {
        let mut ids = tour_target_ids();
        assert_eq!(ids.len(), 19);
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), 19);
        assert!(is_tour_id("status-bar"));
    }
}
