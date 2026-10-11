//! Library sidebar view ids (FE `LibraryViewTabs`).

pub const LIBRARY_VIEW_IDS: &[&str] = &[
    "folders",
    "recent",
    "favorites",
    "tags",
    "graph",
    "journal",
    "chat",
    "agent",
    "duplicates",
    "tasks",
    "wikiHealth",
    "storage",
];

pub fn library_view_ids() -> Vec<String> {
    LIBRARY_VIEW_IDS.iter().map(|s| (*s).to_string()).collect()
}

pub fn is_library_view_id(value: &str) -> bool {
    LIBRARY_VIEW_IDS.contains(&value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn includes_wiki_health() {
        assert!(is_library_view_id("wikiHealth"));
        assert_eq!(library_view_ids().len(), 12);
    }
}
