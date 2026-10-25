//! Dioxus SSR chrome surfaces hosted by Tauri `scribe-ui` window.

mod i18n;
mod shell;
mod surfaces;

pub use crate::components;
pub use i18n::StringMap;
pub use surfaces::{
    AboutProps, DocsProps, DocsTopicContent, PrivacyArticle, PrivacyProps, RecentDoc,
    UiSurface, UiSurfaceRequest, WelcomeProps, WhatsNewProps,
};

use dioxus::prelude::*;
use surfaces::{about_view, docs_view, privacy_view, welcome_view, whats_new_view};

/// Render a chrome surface to a full HTML document.
pub fn render_ui_surface(request: &UiSurfaceRequest) -> String {
    let body = match request.surface {
        UiSurface::WhatsNew => ssr(whats_new_view, WhatsNewProps::from_request(request)),
        UiSurface::Welcome => ssr(welcome_view, WelcomeProps::from_request(request)),
        UiSurface::Privacy => ssr(privacy_view, PrivacyProps::from_request(request)),
        UiSurface::About => ssr(about_view, AboutProps::from_request(request)),
        UiSurface::Docs => ssr(docs_view, DocsProps::from_request(request)),
    };
    shell::wrap_document(&body, request.surface.as_id())
}

fn ssr<P: Clone + PartialEq + 'static>(
    root: fn(P) -> Element,
    props: P,
) -> String {
    let mut vdom = VirtualDom::new_with_props(root, props);
    vdom.rebuild_in_place();
    dioxus_ssr::render(&vdom)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ui_manifest;
    use std::collections::HashMap;

    fn strings() -> StringMap {
        let mut map = HashMap::new();
        for (k, v) in [
            ("whatsNew.gotIt", "Got it"),
            ("whatsNew.kicker", "Edition notes"),
            ("whatsNew.title", "Scribe 4.2"),
            ("whatsNew.subtitle", "Subtitle"),
            ("whatsNew.editionMark", "Workspace · Design"),
            ("whatsNew.badge", "What's new"),
            ("whatsNew.tagsLabel", "Themes"),
            ("whatsNew.tags.library", "Library"),
            ("whatsNew.tags.capture", "Capture"),
            ("whatsNew.tags.media", "Media"),
            ("whatsNew.localVideoLibrary.title", "Video"),
            ("whatsNew.localVideoLibrary.description", "Import"),
            ("whatsNew.mcpWriteCountdown.title", "MCP"),
            ("whatsNew.mcpWriteCountdown.description", "TTL"),
            ("whatsNew.syncMergeStudio.title", "Merge"),
            ("whatsNew.syncMergeStudio.description", "Format"),
            ("whatsNew.captureInbox.title", "Capture"),
            ("whatsNew.captureInbox.description", "Triage"),
            ("whatsNew.wikiHealthQueue.title", "Wiki"),
            ("whatsNew.wikiHealthQueue.description", "NLP"),
            ("whatsNew.footNote", "Note"),
            ("welcome.brandWithEdition", "Scribe 4.2"),
            ("welcome.brand", "Scribe"),
            ("welcome.newDocument", "New"),
            ("welcome.todayNote", "Today"),
            ("welcome.import", "Import"),
            ("welcome.recent", "Recent"),
            ("welcome.openDocs", "Docs"),
            ("common.close", "Close"),
            ("settings.privacy.kicker", "Privacy"),
            ("settings.privacy.title", "Privacy"),
            ("settings.privacy.effective", "Effective"),
            ("settings.privacy.lead", "Lead"),
            ("settings.privacy.colophon", "Colophon"),
            ("settings.about.tagline", "Tagline"),
            ("settings.about.replayTour", "Tour"),
            ("settings.about.platform", "Platform"),
            ("settings.about.fileFormat", "Format"),
            ("settings.about.export", "Export"),
            ("settings.about.privacy", "Privacy"),
            ("common.version", "Scribe 4.3.0"),
            ("settings.docs.pageTitle", "Docs"),
            ("settings.docs.pageDescription", "Desc"),
            ("settings.docs.searchPlaceholder", "Search"),
        ] {
            map.insert(k.into(), v.into());
        }
        map
    }

    #[test]
    fn renders_whats_new() {
        let manifest = ui_manifest();
        let html = render_ui_surface(&UiSurfaceRequest {
            surface: UiSurface::WhatsNew,
            locale: "en".into(),
            strings: strings(),
            version: manifest.version.clone(),
            short_version: manifest.short_version.clone(),
            highlights: manifest.whats_new_highlights.clone(),
            highlight_copy: manifest
                .whats_new_highlights
                .iter()
                .map(|id| (id.clone(), (format!("{id} title"), format!("{id} body"))))
                .collect(),
            recent: vec![],
            privacy_articles: vec![],
            docs_topics: vec![],
            docs_groups: vec![],
        });
        assert!(html.contains("Got it"));
        assert!(html.contains("setup-folio"));
        assert!(html.contains("scribe-ui-bridge"));
        assert!(html.contains("if (!event || !ALLOWED[event]) return;"));
        assert!(!html.contains(", '*'"), "UI bridge must not postMessage to '*'");
    }

    #[test]
    fn bridge_js_allowlists_events() {
        let js = shell::BRIDGE_JS;
        assert!(js.contains("'welcome-new-document': 1"));
        assert!(js.contains("'whats-new-acked': 1"));
        assert!(js.contains("postMessage("));
        assert!(!js.contains(", '*'"));
    }
}
