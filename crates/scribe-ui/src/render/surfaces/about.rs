use dioxus::prelude::*;

use super::UiSurfaceRequest;
use crate::render::i18n::{t, StringMap};

#[derive(Props, Clone, PartialEq)]
pub struct AboutProps {
    pub strings: StringMap,
    pub version: String,
    pub short_version: String,
}

impl AboutProps {
    pub fn from_request(request: &UiSurfaceRequest) -> Self {
        Self {
            strings: request.strings.clone(),
            version: request.version.clone(),
            short_version: request.short_version.clone(),
        }
    }
}

pub fn about_view(props: AboutProps) -> Element {
    let tagline = t(&props.strings, "settings.about.tagline")
        .replace("{{version}}", &props.short_version);
    let version_line = t(&props.strings, "common.version").replace("{{version}}", &props.version);

    rsx! {
        div { class: "sui-panel",
            div { class: "sui-card",
                h1 { "{t(&props.strings, \"welcome.brand\")}" }
                p { class: "lead", "{tagline}" }
                p { class: "lead", "{version_line}" }
                div { class: "sui-actions",
                    button { class: "primary", "data-sui-event": "about-replay-tour",
                        "{t(&props.strings, \"settings.about.replayTour\")}"
                    }
                }
            }
            div { class: "sui-row",
                span { "{t(&props.strings, \"settings.about.platform\")}" }
                strong { "macOS" }
            }
            div { class: "sui-row",
                span { "{t(&props.strings, \"settings.about.fileFormat\")}" }
                strong { ".scribe" }
            }
            div { class: "sui-row",
                span { "{t(&props.strings, \"settings.about.export\")}" }
                strong { "PDF, DOCX, TXT, Pages" }
            }
            div { class: "sui-actions",
                button { class: "sui-link-btn", "data-sui-event": "about-open-privacy",
                    "{t(&props.strings, \"settings.about.privacy\")}"
                }
            }
        }
    }
}
