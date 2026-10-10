use dioxus::prelude::*;

/// Standard chrome content panel.
#[component]
pub fn SuiPanel(
    #[props(default)]
    class: String,
    children: Element,
) -> Element {
    let class_name = if class.is_empty() {
        "sui-panel".to_string()
    } else {
        format!("sui-panel {class}")
    };
    rsx! {
        div { class: "{class_name}",
            {children}
        }
    }
}

#[component]
pub fn SuiCard(children: Element) -> Element {
    rsx! {
        div { class: "sui-card",
            {children}
        }
    }
}

/// Label / value meta row used on About and similar surfaces.
#[component]
pub fn SuiMetaRow(label: String, value: String) -> Element {
    rsx! {
        div { class: "sui-row",
            span { "{label}" }
            strong { "{value}" }
        }
    }
}

/// Text-style button that still goes through the sui event bridge.
#[component]
pub fn SuiLinkButton(
    event: String,
    #[props(default)]
    arg: String,
    children: Element,
) -> Element {
    rsx! {
        button {
            class: "sui-link-btn",
            "data-sui-event": "{event}",
            "data-sui-arg": "{arg}",
            {children}
        }
    }
}
