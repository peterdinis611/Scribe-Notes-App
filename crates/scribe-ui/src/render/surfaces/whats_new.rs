use dioxus::prelude::*;

use super::UiSurfaceRequest;
use crate::components::{
    FolioCount, FolioFoot, FolioHead, FolioKicker, FolioLead, FolioMargin, FolioNumeral, FolioPage,
    FolioRoot, FolioShell, FolioTags, FolioTitle, SuiButton, SuiButtonVariant,
};
use crate::render::i18n::{t, StringMap};
use crate::whats_new_highlights;

#[derive(Props, Clone, PartialEq)]
pub struct WhatsNewProps {
    pub strings: StringMap,
    pub version: String,
    pub short_version: String,
    pub highlights: Vec<(String, String, String)>,
}

impl WhatsNewProps {
    pub fn from_request(request: &UiSurfaceRequest) -> Self {
        let ids = if request.highlights.is_empty() {
            whats_new_highlights()
        } else {
            request.highlights.clone()
        };
        let highlights = ids
            .into_iter()
            .map(|id| {
                let (title, body) = request
                    .highlight_copy
                    .get(&id)
                    .cloned()
                    .unwrap_or_else(|| {
                        (
                            t(&request.strings, &format!("whatsNew.{id}.title")),
                            t(&request.strings, &format!("whatsNew.{id}.description")),
                        )
                    });
                (id, title, body)
            })
            .collect();
        Self {
            strings: request.strings.clone(),
            version: request.version.clone(),
            short_version: request.short_version.clone(),
            highlights,
        }
    }
}

pub fn whats_new_view(props: WhatsNewProps) -> Element {
    let brand = t(&props.strings, "welcome.brandWithEdition").replace("{{version}}", &props.short_version);
    let badge = t(&props.strings, "whatsNew.badge").replace("{{version}}", &props.version);
    let title = t(&props.strings, "whatsNew.title").replace("{{version}}", &props.short_version);
    let tags = vec![
        t(&props.strings, "whatsNew.tags.agents"),
        t(&props.strings, "whatsNew.tags.handoffs"),
        t(&props.strings, "whatsNew.tags.recipes"),
    ];

    rsx! {
        FolioRoot {
            FolioShell { class: "setup-folio--news",
                FolioMargin {
                    p { class: "setup-folio-brand", "{brand}" }
                    div {
                        FolioNumeral { text: props.short_version.clone() }
                        p { class: "setup-folio-edition-mark", "{t(&props.strings, \"whatsNew.editionMark\")}" }
                    }
                    FolioCount { text: badge }
                }
                FolioPage {
                    FolioHead {
                        FolioKicker { text: t(&props.strings, "whatsNew.kicker") }
                        FolioTitle { text: title }
                        FolioLead { text: t(&props.strings, "whatsNew.subtitle") }
                        FolioTags { tags }
                    }
                    ol { class: "setup-folio-points",
                        for (index, (_id, title, body)) in props.highlights.iter().enumerate() {
                            {
                                let num = format!("{:02}", index + 1);
                                rsx! {
                                    li {
                                        span { "{num}" }
                                        div {
                                            strong { "{title}" }
                                            p { "{body}" }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    FolioFoot {
                        span { class: "setup-folio-foot-note", "{t(&props.strings, \"whatsNew.footNote\")}" }
                        SuiButton {
                            variant: SuiButtonVariant::FolioNext,
                            event: "whats-new-acked",
                            "{t(&props.strings, \"whatsNew.gotIt\")}"
                        }
                    }
                }
            }
        }
    }
}
