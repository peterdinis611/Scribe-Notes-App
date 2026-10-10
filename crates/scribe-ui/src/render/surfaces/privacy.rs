use dioxus::prelude::*;
use serde::{Deserialize, Serialize};

use super::UiSurfaceRequest;
use crate::render::i18n::{t, StringMap};
use crate::privacy_article_ids;
use crate::PRIVACY_EFFECTIVE_DATE;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyArticle {
    pub id: String,
    pub title: String,
    pub paragraphs: Vec<String>,
}

#[derive(Props, Clone, PartialEq)]
pub struct PrivacyProps {
    pub strings: StringMap,
    pub version: String,
    pub articles: Vec<PrivacyArticle>,
}

impl PrivacyProps {
    pub fn from_request(request: &UiSurfaceRequest) -> Self {
        let articles = if request.privacy_articles.is_empty() {
            privacy_article_ids()
                .into_iter()
                .map(|id| PrivacyArticle {
                    id: id.clone(),
                    title: t(&request.strings, &format!("settings.privacy.articles.{id}.title")),
                    paragraphs: vec![t(
                        &request.strings,
                        &format!("settings.privacy.articles.{id}.paragraphs"),
                    )],
                })
                .collect()
        } else {
            request.privacy_articles.clone()
        };
        Self {
            strings: request.strings.clone(),
            version: request.version.clone(),
            articles,
        }
    }
}

pub fn privacy_view(props: PrivacyProps) -> Element {
    let effective = t(&props.strings, "settings.privacy.effective")
        .replace("{{version}}", &props.version);
    let effective_date = format!("Effective date: {PRIVACY_EFFECTIVE_DATE}");
    let kicker = t(&props.strings, "settings.privacy.kicker");
    let title = t(&props.strings, "settings.privacy.title");
    let lead = t(&props.strings, "settings.privacy.lead");
    let colophon = t(&props.strings, "settings.privacy.colophon");

    rsx! {
        div { class: "sui-panel privacy-notice",
            header {
                p { class: "setup-folio-kicker", "{kicker}" }
                h1 { class: "setup-folio-title", "{title}" }
                p { class: "lead", "{effective}" }
                p { class: "lead", "{lead}" }
                p { class: "lead", "{effective_date}" }
            }
            ol { class: "sui-articles",
                for (index, article) in props.articles.iter().enumerate() {
                    {
                        let num = format!("{:02}", index + 1);
                        let article_title = article.title.clone();
                        let paragraphs = article.paragraphs.clone();
                        rsx! {
                            li {
                                span { "{num}" }
                                div {
                                    h3 { "{article_title}" }
                                    for paragraph in paragraphs.iter() {
                                        p { class: "lead", "{paragraph}" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            footer { class: "lead", "{colophon}" }
        }
    }
}
