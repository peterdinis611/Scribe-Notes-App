mod about;
mod docs;
mod privacy;
mod welcome;
mod whats_new;

pub use about::{about_view, AboutProps};
pub use docs::{docs_view, DocsProps, DocsTopicContent};
pub use privacy::{privacy_view, PrivacyArticle, PrivacyProps};
pub use welcome::{welcome_view, RecentDoc, WelcomeProps};
pub use whats_new::{whats_new_view, WhatsNewProps};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::i18n::StringMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UiSurface {
    WhatsNew,
    Welcome,
    Privacy,
    About,
    Docs,
}

impl UiSurface {
    pub fn as_id(self) -> &'static str {
        match self {
            Self::WhatsNew => "whats-new",
            Self::Welcome => "welcome",
            Self::Privacy => "privacy",
            Self::About => "about",
            Self::Docs => "docs",
        }
    }

    pub fn parse_id(value: &str) -> Option<Self> {
        match value {
            "whats-new" | "whatsNew" => Some(Self::WhatsNew),
            "welcome" => Some(Self::Welcome),
            "privacy" => Some(Self::Privacy),
            "about" => Some(Self::About),
            "docs" => Some(Self::Docs),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UiSurfaceRequest {
    pub surface: UiSurface,
    #[serde(default)]
    pub locale: String,
    #[serde(default)]
    pub strings: StringMap,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub short_version: String,
    #[serde(default)]
    pub highlights: Vec<String>,
    /// highlight id → (title, description)
    #[serde(default)]
    pub highlight_copy: HashMap<String, (String, String)>,
    #[serde(default)]
    pub recent: Vec<RecentDoc>,
    #[serde(default)]
    pub privacy_articles: Vec<PrivacyArticle>,
    #[serde(default)]
    pub docs_topics: Vec<DocsTopicContent>,
    #[serde(default)]
    pub docs_groups: Vec<(String, Vec<String>)>,
}

impl Default for UiSurface {
    fn default() -> Self {
        Self::WhatsNew
    }
}
