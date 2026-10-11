use dioxus::prelude::*;
use serde::{Deserialize, Serialize};

use super::UiSurfaceRequest;
use crate::components::{
    FolioKicker, FolioTitle, SuiActions, SuiButton, SuiButtonVariant, SuiPanel,
};
use crate::render::i18n::{t, StringMap};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentDoc {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub updated_label: String,
}

#[derive(Props, Clone, PartialEq)]
pub struct WelcomeProps {
    pub strings: StringMap,
    pub version: String,
    pub short_version: String,
    pub recent: Vec<RecentDoc>,
}

impl WelcomeProps {
    pub fn from_request(request: &UiSurfaceRequest) -> Self {
        Self {
            strings: request.strings.clone(),
            version: request.version.clone(),
            short_version: request.short_version.clone(),
            recent: request.recent.clone(),
        }
    }
}

pub fn welcome_view(props: WelcomeProps) -> Element {
    let brand = t(&props.strings, "welcome.brandWithEdition")
        .replace("{{version}}", &props.short_version);

    rsx! {
        SuiPanel {
            FolioKicker { text: brand }
            FolioTitle { text: t(&props.strings, "welcome.brand") }
            p { class: "lead", "{t(&props.strings, \"whatsNew.subtitle\")}" }
            SuiActions {
                SuiButton {
                    variant: SuiButtonVariant::Primary,
                    event: "welcome-new-document",
                    "{t(&props.strings, \"welcome.newDocument\")}"
                }
                SuiButton {
                    event: "welcome-today",
                    "{t(&props.strings, \"welcome.todayNote\")}"
                }
                SuiButton {
                    event: "welcome-import",
                    "{t(&props.strings, \"common.import\")}"
                }
                SuiButton {
                    event: "welcome-open-docs",
                    "{t(&props.strings, \"nav.docs\")}"
                }
            }
            if !props.recent.is_empty() {
                h3 { "{t(&props.strings, \"welcome.recentDocuments\")}" }
                ul { class: "sui-recent",
                    for doc in props.recent.iter() {
                        li {
                            SuiButton {
                                event: "welcome-open-document",
                                arg: "{doc.id}",
                                strong { "{doc.title}" }
                                span { "{doc.updated_label}" }
                            }
                        }
                    }
                }
            }
        }
    }
}
