use dioxus::prelude::*;

use super::UiSurfaceRequest;
use crate::components::{
    SuiActions, SuiButton, SuiButtonVariant, SuiCard, SuiLinkButton, SuiMetaRow, SuiPanel,
};
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
        SuiPanel {
            SuiCard {
                h1 { "{t(&props.strings, \"welcome.brand\")}" }
                p { class: "lead", "{tagline}" }
                p { class: "lead", "{version_line}" }
                SuiActions {
                    SuiButton {
                        variant: SuiButtonVariant::Primary,
                        event: "about-replay-tour",
                        "{t(&props.strings, \"settings.about.replayTour\")}"
                    }
                }
            }
            SuiMetaRow {
                label: t(&props.strings, "settings.about.platform"),
                value: "macOS",
            }
            SuiMetaRow {
                label: t(&props.strings, "settings.about.fileFormat"),
                value: ".scribe",
            }
            SuiMetaRow {
                label: t(&props.strings, "settings.about.export"),
                value: "PDF, DOCX, TXT, Pages",
            }
            SuiActions {
                SuiLinkButton {
                    event: "about-open-privacy",
                    "{t(&props.strings, \"settings.about.privacy\")}"
                }
            }
        }
    }
}
