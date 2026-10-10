use dioxus::prelude::*;

/// Centered folio stage used by Whats New / edition chrome.
#[component]
pub fn FolioRoot(children: Element) -> Element {
    rsx! {
        div { class: "setup-folio-root",
            {children}
        }
    }
}

#[component]
pub fn FolioShell(
    #[props(default)]
    class: String,
    children: Element,
) -> Element {
    let class_name = if class.is_empty() {
        "setup-folio".to_string()
    } else {
        format!("setup-folio {class}")
    };
    rsx! {
        div { class: "{class_name}",
            {children}
        }
    }
}

#[component]
pub fn FolioMargin(children: Element) -> Element {
    rsx! {
        aside { class: "setup-folio-margin",
            {children}
        }
    }
}

#[component]
pub fn FolioPage(children: Element) -> Element {
    rsx! {
        div { class: "setup-folio-page",
            {children}
        }
    }
}

#[component]
pub fn FolioKicker(text: String) -> Element {
    rsx! {
        p { class: "setup-folio-kicker", "{text}" }
    }
}

#[component]
pub fn FolioTitle(text: String) -> Element {
    rsx! {
        h1 { class: "setup-folio-title", "{text}" }
    }
}

#[component]
pub fn FolioLead(text: String) -> Element {
    rsx! {
        p { class: "setup-folio-lead", "{text}" }
    }
}

#[component]
pub fn FolioNumeral(text: String) -> Element {
    rsx! {
        span { class: "setup-folio-numeral", "{text}" }
    }
}

#[component]
pub fn FolioCount(text: String) -> Element {
    rsx! {
        p { class: "setup-folio-count", "{text}" }
    }
}

#[component]
pub fn FolioHead(children: Element) -> Element {
    rsx! {
        header { class: "setup-folio-head",
            {children}
        }
    }
}

#[component]
pub fn FolioFoot(children: Element) -> Element {
    rsx! {
        footer { class: "setup-folio-foot",
            {children}
        }
    }
}

#[component]
pub fn FolioTags(tags: Vec<String>) -> Element {
    rsx! {
        ul { class: "setup-folio-tags",
            for tag in tags.iter() {
                li { "{tag}" }
            }
        }
    }
}
