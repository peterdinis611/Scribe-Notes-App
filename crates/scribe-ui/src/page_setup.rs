//! Page size / margin catalogs + normalize/resolve helpers.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PaperSizeId {
    A4,
    Letter,
    A5,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PageMargins {
    pub margin_top: f64,
    pub margin_bottom: f64,
    pub margin_left: f64,
    pub margin_right: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PaperSize {
    pub id: String,
    pub label: String,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedPageLayout {
    pub width: f64,
    pub padding_top: f64,
    pub padding_bottom: f64,
    pub padding_left: f64,
    pub padding_right: f64,
    pub content_height: f64,
    pub scroll_padding_top: f64,
    pub paper_height: f64,
}

pub fn paper_sizes() -> Vec<PaperSize> {
    vec![
        PaperSize { id: "a4".into(), label: "A4".into(), width: 794.0, height: 1123.0 },
        PaperSize { id: "letter".into(), label: "Letter (US)".into(), width: 816.0, height: 1056.0 },
        PaperSize { id: "a5".into(), label: "A5".into(), width: 559.0, height: 794.0 },
    ]
}

pub fn default_margins() -> PageMargins {
    PageMargins {
        margin_top: 56.0,
        margin_bottom: 72.0,
        margin_left: 64.0,
        margin_right: 64.0,
    }
}

pub fn resolve_page_layout(paper_id: &str, margins: &PageMargins, header_footer_reserve: f64) -> ResolvedPageLayout {
    let paper = paper_sizes()
        .into_iter()
        .find(|p| p.id == paper_id)
        .unwrap_or_else(|| paper_sizes()[0].clone());
    let content_height = (paper.height - margins.margin_top - margins.margin_bottom - header_footer_reserve)
        .max(480.0);
    ResolvedPageLayout {
        width: paper.width,
        padding_top: margins.margin_top,
        padding_bottom: margins.margin_bottom,
        padding_left: margins.margin_left,
        padding_right: margins.margin_right,
        content_height,
        scroll_padding_top: 20.0,
        paper_height: paper.height,
    }
}

pub fn paper_size_ids() -> Vec<String> {
    paper_sizes().into_iter().map(|p| p.id).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_a4() {
        let layout = resolve_page_layout("a4", &default_margins(), 0.0);
        assert_eq!(layout.width, 794.0);
        assert!(layout.content_height >= 480.0);
    }
}
