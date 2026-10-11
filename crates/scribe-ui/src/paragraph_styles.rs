//! Paragraph style catalog (`src/lib/editor/paragraph-styles.ts`).
//!
//! TipTap `chain()` application stays in the frontend; Rust owns the catalog and
//! the resolved block attributes each style should set.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ParagraphStyleId {
    Title,
    Subtitle,
    Heading,
    Body,
    Caption,
}

impl ParagraphStyleId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Title => "title",
            Self::Subtitle => "subtitle",
            Self::Heading => "heading",
            Self::Body => "body",
            Self::Caption => "caption",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "title" => Some(Self::Title),
            "subtitle" => Some(Self::Subtitle),
            "heading" => Some(Self::Heading),
            "body" => Some(Self::Body),
            "caption" => Some(Self::Caption),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParagraphStyleDef {
    pub id: String,
    pub label: String,
    pub hint: String,
}

/// Resolved attrs the FE applies after switching node type.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParagraphStyleAttrs {
    pub id: String,
    /// `"heading"` or `"paragraph"`.
    pub node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading_level: Option<u8>,
    pub line_height: String,
    pub space_before: String,
    pub space_after: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<String>,
    pub italic: bool,
    pub clear_bold: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_align: Option<String>,
}

pub const PARAGRAPH_STYLE_IDS: &[&str] = &["title", "subtitle", "heading", "body", "caption"];

pub fn paragraph_style_ids() -> Vec<String> {
    PARAGRAPH_STYLE_IDS.iter().map(|s| (*s).to_string()).collect()
}

pub fn is_paragraph_style_id(id: &str) -> bool {
    ParagraphStyleId::parse(id).is_some()
}

pub fn paragraph_styles() -> Vec<ParagraphStyleDef> {
    vec![
        ParagraphStyleDef {
            id: "title".into(),
            label: "Titulok".into(),
            hint: "Hlavný názov dokumentu".into(),
        },
        ParagraphStyleDef {
            id: "subtitle".into(),
            label: "Podtitul".into(),
            hint: "Podnadpis alebo perex".into(),
        },
        ParagraphStyleDef {
            id: "heading".into(),
            label: "Nadpis sekcie".into(),
            hint: "Sekčný nadpis".into(),
        },
        ParagraphStyleDef {
            id: "body".into(),
            label: "Text".into(),
            hint: "Bežný odsek".into(),
        },
        ParagraphStyleDef {
            id: "caption".into(),
            label: "Popisok".into(),
            hint: "Malý popis pod obrázkom".into(),
        },
    ]
}

pub fn resolve_paragraph_style(id: &str) -> Option<ParagraphStyleAttrs> {
    let style = ParagraphStyleId::parse(id)?;
    Some(match style {
        ParagraphStyleId::Title => ParagraphStyleAttrs {
            id: style.as_str().into(),
            node_type: "heading".into(),
            heading_level: Some(1),
            line_height: "1.15".into(),
            space_before: "0px".into(),
            space_after: "12px".into(),
            font_size: Some("32px".into()),
            italic: false,
            clear_bold: false,
            text_align: None,
        },
        ParagraphStyleId::Subtitle => ParagraphStyleAttrs {
            id: style.as_str().into(),
            node_type: "heading".into(),
            heading_level: Some(2),
            line_height: "1.25".into(),
            space_before: "0px".into(),
            space_after: "10px".into(),
            font_size: Some("22px".into()),
            italic: false,
            clear_bold: false,
            text_align: None,
        },
        ParagraphStyleId::Heading => ParagraphStyleAttrs {
            id: style.as_str().into(),
            node_type: "heading".into(),
            heading_level: Some(3),
            line_height: "1.3".into(),
            space_before: "12px".into(),
            space_after: "8px".into(),
            font_size: Some("18px".into()),
            italic: false,
            clear_bold: false,
            text_align: None,
        },
        ParagraphStyleId::Body => ParagraphStyleAttrs {
            id: style.as_str().into(),
            node_type: "paragraph".into(),
            heading_level: None,
            line_height: "1.6".into(),
            space_before: "0px".into(),
            space_after: "0px".into(),
            font_size: None,
            italic: false,
            clear_bold: true,
            text_align: None,
        },
        ParagraphStyleId::Caption => ParagraphStyleAttrs {
            id: style.as_str().into(),
            node_type: "paragraph".into(),
            heading_level: None,
            line_height: "1.4".into(),
            space_before: "6px".into(),
            space_after: "0px".into(),
            font_size: Some("12px".into()),
            italic: true,
            clear_bold: false,
            text_align: Some("center".into()),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_resolves() {
        assert_eq!(paragraph_styles().len(), 5);
        let title = resolve_paragraph_style("title").unwrap();
        assert_eq!(title.heading_level, Some(1));
        assert_eq!(title.font_size.as_deref(), Some("32px"));
        let body = resolve_paragraph_style("body").unwrap();
        assert!(body.clear_bold);
        assert!(resolve_paragraph_style("nope").is_none());
    }
}
