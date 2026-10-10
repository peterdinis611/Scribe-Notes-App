//! Local plugin marketplace listings (`src/lib/plugins/marketplace.ts`).
//! Sample packages are embedded from the FE example JSON so both sides stay in sync.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MarketplaceKind {
    Sample,
    Official,
    Community,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceListing {
    pub id: String,
    pub name: String,
    pub version: String,
    pub summary: String,
    pub author: String,
    /// `writing | study | workspace | other | sample`
    pub category: String,
    pub verified: bool,
    pub kind: MarketplaceKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bundled_plugin_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package_json: Option<String>,
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub coming_soon: Option<bool>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceStatus {
    pub enabled: bool,
    pub mode: &'static str,
    pub reason: &'static str,
}

pub const MARKETPLACE_STATUS: MarketplaceStatus = MarketplaceStatus {
    enabled: true,
    mode: "local",
    reason: "Local catalog: install sample packages now. Signed remote discovery is not wired yet.",
};

const HELLO_PACKAGE: &str = include_str!("../../../src/lib/plugins/examples/hello.scribe-ext.json");
const SLASH_BLOCK_PACKAGE: &str =
    include_str!("../../../src/lib/plugins/examples/slash-block.scribe-ext.json");
const COMMAND_NOTIFY_PACKAGE: &str =
    include_str!("../../../src/lib/plugins/examples/command-notify.scribe-ext.json");

const SAMPLE_PACKAGES: &[(&str, &[&str])] = &[
    (HELLO_PACKAGE, &["commands", "starter"]),
    (SLASH_BLOCK_PACKAGE, &["blocks", "slash"]),
    (COMMAND_NOTIFY_PACKAGE, &["commands", "active-doc"]),
];

/// (id, name, summary, category, bundled plugin id, tags)
type OfficialRow = (&'static str, &'static str, &'static str, &'static str, &'static str, &'static [&'static str]);

const OFFICIAL_FEATURED: &[OfficialRow] = &[
    ("official.daily-journal", "Daily journal", "Slash template and command for a dated journal entry.", "writing", "scribe.daily-journal", &["writing", "slash"]),
    ("official.flashcard-block", "Flashcards", "Study cards as a slash block inside notes.", "study", "scribe.flashcards", &["study", "blocks"]),
    ("official.status-meta", "Status meta", "Per-note status in the sidebar, settings, and editor.", "workspace", "scribe.status-meta", &["workspace", "sidebar"]),
    ("official.plaintext-export", "Plaintext export", "Export the open note as plain text.", "writing", "scribe.plaintext-export", &["export"]),
];

fn str_field(value: &Value, key: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

fn sample_listing(raw: &str, tags: &[&str]) -> Option<MarketplaceListing> {
    let pkg: Value = serde_json::from_str(raw).ok()?;
    let manifest = pkg.get("manifest")?;
    Some(MarketplaceListing {
        id: str_field(manifest, "id"),
        name: str_field(manifest, "name"),
        version: str_field(manifest, "version"),
        summary: str_field(manifest, "description"),
        author: "Scribe examples".into(),
        category: "sample".into(),
        verified: true,
        kind: MarketplaceKind::Sample,
        bundled_plugin_id: None,
        package_json: serde_json::to_string(&pkg).ok(),
        tags: tags.iter().map(|t| (*t).to_string()).collect(),
        coming_soon: None,
    })
}

pub fn list_marketplace_listings() -> Vec<MarketplaceListing> {
    let mut out: Vec<MarketplaceListing> = SAMPLE_PACKAGES
        .iter()
        .filter_map(|(raw, tags)| sample_listing(raw, tags))
        .collect();

    out.extend(OFFICIAL_FEATURED.iter().map(|(id, name, summary, category, bundled, tags)| {
        MarketplaceListing {
            id: (*id).into(),
            name: (*name).into(),
            version: "1.0.0".into(),
            summary: (*summary).into(),
            author: "Scribe".into(),
            category: (*category).into(),
            verified: true,
            kind: MarketplaceKind::Official,
            bundled_plugin_id: Some((*bundled).into()),
            package_json: None,
            tags: tags.iter().map(|t| (*t).to_string()).collect(),
            coming_soon: None,
        }
    }));

    out.push(MarketplaceListing {
        id: "community.example".into(),
        name: "Community example".into(),
        version: "0.0.0".into(),
        summary: "Placeholder for a future signed community plugin.".into(),
        author: "Community".into(),
        category: "other".into(),
        verified: false,
        kind: MarketplaceKind::Community,
        bundled_plugin_id: None,
        package_json: None,
        tags: vec!["remote".into()],
        coming_soon: Some(true),
    });
    out
}

pub fn list_marketplace_by_kind(kind: Option<MarketplaceKind>) -> Vec<MarketplaceListing> {
    let all = list_marketplace_listings();
    match kind {
        None => all,
        Some(k) => all.into_iter().filter(|item| item.kind == k).collect(),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginUpdate {
    pub id: String,
    pub current: String,
    pub latest: String,
}

/// Remote discovery is not wired yet — always empty (mirrors FE).
pub fn check_plugin_updates() -> Vec<PluginUpdate> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_eight_in_order() {
        let all = list_marketplace_listings();
        assert_eq!(all.len(), 8);
        assert_eq!(all[0].id, "example.hello");
        assert_eq!(all[0].kind, MarketplaceKind::Sample);
        assert_eq!(all[3].id, "official.daily-journal");
        assert_eq!(all[7].id, "community.example");
        assert_eq!(all[7].coming_soon, Some(true));
    }

    #[test]
    fn samples_carry_package_json() {
        let samples = list_marketplace_by_kind(Some(MarketplaceKind::Sample));
        assert_eq!(samples.len(), 3);
        for s in &samples {
            let pkg: Value = serde_json::from_str(s.package_json.as_deref().unwrap()).unwrap();
            assert_eq!(pkg["manifest"]["id"], s.id.as_str());
            assert!(!s.summary.is_empty());
        }
    }

    #[test]
    fn filters_by_kind() {
        assert_eq!(list_marketplace_by_kind(None).len(), 8);
        assert_eq!(list_marketplace_by_kind(Some(MarketplaceKind::Official)).len(), 4);
        assert_eq!(list_marketplace_by_kind(Some(MarketplaceKind::Community)).len(), 1);
    }

    #[test]
    fn serializes_camel_case_and_status() {
        let official = &list_marketplace_listings()[3];
        let json = serde_json::to_value(official).unwrap();
        assert_eq!(json["bundledPluginId"], "scribe.daily-journal");
        assert!(json.get("packageJson").is_none());
        assert_eq!(serde_json::to_value(MARKETPLACE_STATUS).unwrap()["mode"], "local");
        assert!(check_plugin_updates().is_empty());
    }
}
