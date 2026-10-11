use dioxus::prelude::*;
use serde::{Deserialize, Serialize};

use super::UiSurfaceRequest;
use crate::components::{FolioKicker, FolioTitle};
use crate::docs_nav::{docs_groups, docs_topic_ids};
use crate::render::i18n::{t, StringMap};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocsTopicContent {
    pub id: String,
    pub title: String,
    pub summary: String,
    #[serde(default)]
    pub paragraphs: Vec<String>,
    #[serde(default)]
    pub points: Vec<String>,
}

#[derive(Props, Clone, PartialEq)]
pub struct DocsProps {
    pub strings: StringMap,
    pub short_version: String,
    pub topics: Vec<DocsTopicContent>,
    pub groups: Vec<(String, Vec<String>)>,
}

impl DocsProps {
    pub fn from_request(request: &UiSurfaceRequest) -> Self {
        let topics = if request.docs_topics.is_empty() {
            docs_topic_ids()
                .into_iter()
                .map(|id| DocsTopicContent {
                    id: id.clone(),
                    title: t(
                        &request.strings,
                        &format!("settings.docs.topics.{id}.title"),
                    )
                    .replace("{{version}}", &request.short_version),
                    summary: t(
                        &request.strings,
                        &format!("settings.docs.topics.{id}.summary"),
                    )
                    .replace("{{version}}", &request.short_version),
                    paragraphs: vec![],
                    points: vec![],
                })
                .collect()
        } else {
            request.docs_topics.clone()
        };
        let groups = if request.docs_groups.is_empty() {
            docs_groups()
                .into_iter()
                .map(|g| (g.id, g.topics))
                .collect()
        } else {
            request.docs_groups.clone()
        };
        Self {
            strings: request.strings.clone(),
            short_version: request.short_version.clone(),
            topics,
            groups,
        }
    }
}

pub fn docs_view(props: DocsProps) -> Element {
    let page_title = t(&props.strings, "settings.docs.pageTitle")
        .replace("{{version}}", &props.short_version);
    let page_desc = t(&props.strings, "settings.docs.pageDescription")
        .replace("{{version}}", &props.short_version);
    let brand = t(&props.strings, "welcome.brandWithEdition")
        .replace("{{version}}", &props.short_version);
    let search_ph = t(&props.strings, "settings.docs.searchPlaceholder");

    rsx! {
        div { class: "docs-shell",
            FolioKicker { text: brand }
            FolioTitle { text: page_title }
            p { class: "lead", "{page_desc}" }
            input {
                class: "docs-search",
                r#type: "search",
                placeholder: "{search_ph.clone()}",
                aria_label: "{search_ph}",
                "data-sui-filter": "docs",
            }
            div { class: "docs-groups",
                for (group_id, topic_ids) in props.groups.iter() {
                    section { class: "docs-group",
                        h2 {
                            {
                                let key = format!("settings.docs.groups.{group_id}");
                                let label = t(&props.strings, &key);
                                if label == key { group_id.clone() } else { label }
                            }
                        }
                        for topic_id in topic_ids.iter() {
                            if let Some(topic) = props.topics.iter().find(|t| &t.id == topic_id) {
                                article { class: "docs-topic", id: "docs-{topic_id}",
                                    h3 { "{topic.title}" }
                                    if !topic.summary.is_empty() {
                                        p { class: "docs-topic-summary", "{topic.summary}" }
                                    }
                                    for paragraph in topic.paragraphs.iter() {
                                        p { "{paragraph}" }
                                    }
                                    if !topic.points.is_empty() {
                                        ul {
                                            for point in topic.points.iter() {
                                                li { "{point}" }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
