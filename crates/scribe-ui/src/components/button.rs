use dioxus::prelude::*;

#[derive(Clone, Copy, PartialEq, Eq, Default)]
pub enum SuiButtonVariant {
    #[default]
    Default,
    Primary,
    FolioNext,
    Link,
}

impl SuiButtonVariant {
    fn class(self) -> &'static str {
        match self {
            Self::Default => "",
            Self::Primary => "primary",
            Self::FolioNext => "setup-folio-next",
            Self::Link => "sui-link-btn",
        }
    }
}

/// Chrome action button that emits a `data-sui-event` for the bridge.
#[component]
pub fn SuiButton(
    #[props(default)]
    variant: SuiButtonVariant,
    #[props(default)]
    class: String,
    #[props(default)]
    event: String,
    #[props(default)]
    arg: String,
    children: Element,
) -> Element {
    let mut classes = String::new();
    let variant_class = variant.class();
    if !variant_class.is_empty() {
        classes.push_str(variant_class);
    }
    if !class.is_empty() {
        if !classes.is_empty() {
            classes.push(' ');
        }
        classes.push_str(&class);
    }

    // Bridge ignores empty event attrs; keep attributes present for stable SSR markup.
    rsx! {
        button {
            class: "{classes}",
            "data-sui-event": "{event}",
            "data-sui-arg": "{arg}",
            {children}
        }
    }
}
