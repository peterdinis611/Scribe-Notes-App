use dioxus::prelude::*;

/// Horizontal action cluster (primary / secondary buttons).
#[component]
pub fn SuiActions(children: Element) -> Element {
    rsx! {
        div { class: "sui-actions",
            {children}
        }
    }
}
