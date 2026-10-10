//! Locale key section groups for the settings language catalog.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocaleSectionGroup {
    pub id: String,
    pub sections: Vec<String>,
}

pub fn locale_section_groups() -> Vec<LocaleSectionGroup> {
    vec![
        group("core", &[
            "common", "nav", "welcome", "settings", "toasts", "errors", "setup", "onboarding",
            "appTour", "whatsNew", "demoGuide", "fileMenu", "commandPalette", "shortcuts",
        ]),
        group("editor", &[
            "editor", "toolbar", "editorActions", "slash", "floatingMenu", "findReplace",
            "viewMode", "focusMode", "readingMode", "printLayout", "pageStyles", "pagination",
            "tableOfContents", "footnotes", "math", "lorem", "aiRewrite", "wikiLink", "wikiNav",
            "wikiEmbed", "wikiGhost", "emojiPicker", "codeBlock", "templates", "templateCoach",
        ]),
        group("library", &[
            "library", "libraryChat", "documentChat", "agent", "libraryFindReplace", "libraries",
            "trash", "journal", "linkGraph", "compile", "tabs", "split", "quickNote",
        ]),
        group("panels", &["editorPanels", "panels", "nlp", "diagnostics", "pdfPreview", "structuredPdf"]),
        group("media", &[
            "image", "map", "video", "lottie", "model3d", "canvas", "mermaid", "d3Chart",
            "invoiceDialog", "capture",
        ]),
        group("system", &["storageAccess", "diskSync", "syncConflicts", "vault"]),
    ]
}

fn group(id: &str, sections: &[&str]) -> LocaleSectionGroup {
    LocaleSectionGroup {
        id: id.into(),
        sections: sections.iter().map(|s| (*s).to_string()).collect(),
    }
}

pub fn locale_section_group_ids() -> Vec<String> {
    locale_section_groups().into_iter().map(|g| g.id).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_core() {
        assert!(locale_section_group_ids().contains(&"core".to_string()));
        assert!(locale_section_groups()[0].sections.contains(&"common".to_string()));
    }
}
