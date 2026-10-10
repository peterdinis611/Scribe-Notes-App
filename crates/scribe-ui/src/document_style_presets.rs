//! Document page-style preset catalog (over `page_setup` shapes).

use serde::{Deserialize, Serialize};

use crate::document_styles::{DocumentTypography, DocumentTypographyInput, DEFAULT_DOCUMENT_FONT_SIZE, DEFAULT_DOCUMENT_LINE_HEIGHT, DOCUMENT_BODY_FONT};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PageHeaderFooter {
    pub enabled: bool,
    pub header_text: String,
    pub footer_text: String,
    pub show_page_number: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PageWatermark {
    pub enabled: bool,
    pub text: String,
    pub opacity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FirstPageOptions {
    pub different: bool,
    pub hide_header_footer: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PageSetup {
    pub paper_size: String,
    pub margin_top: f64,
    pub margin_bottom: f64,
    pub margin_left: f64,
    pub margin_right: f64,
    pub header_footer: PageHeaderFooter,
    pub watermark: PageWatermark,
    pub first_page: FirstPageOptions,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub typography: Option<DocumentTypographyInput>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style_preset_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentStylePreset {
    pub id: String,
    pub label_key: String,
    pub description_key: String,
    pub page_setup: PageSetup,
    pub typography: DocumentTypography,
}

fn default_header_footer() -> PageHeaderFooter {
    PageHeaderFooter {
        enabled: false,
        header_text: String::new(),
        footer_text: String::new(),
        show_page_number: true,
    }
}

fn default_watermark() -> PageWatermark {
    PageWatermark {
        enabled: false,
        text: String::new(),
        opacity: 0.12,
    }
}

fn default_first_page() -> FirstPageOptions {
    FirstPageOptions {
        different: false,
        hide_header_footer: false,
    }
}

pub fn default_document_typography() -> DocumentTypography {
    DocumentTypography {
        font_family: DOCUMENT_BODY_FONT.into(),
        font_size: DEFAULT_DOCUMENT_FONT_SIZE,
        line_height: DEFAULT_DOCUMENT_LINE_HEIGHT,
    }
}

pub fn default_page_setup() -> PageSetup {
    let typo = default_document_typography();
    PageSetup {
        paper_size: "a4".into(),
        margin_top: 56.0,
        margin_bottom: 72.0,
        margin_left: 64.0,
        margin_right: 64.0,
        header_footer: default_header_footer(),
        watermark: default_watermark(),
        first_page: default_first_page(),
        typography: Some(DocumentTypographyInput {
            font_family: Some(typo.font_family.clone()),
            font_size: Some(typo.font_size),
            line_height: Some(typo.line_height),
        }),
        style_preset_id: Some("default".into()),
    }
}

fn typography(family: &str, size: f64, line_height: f64) -> DocumentTypography {
    DocumentTypography {
        font_family: family.into(),
        font_size: size,
        line_height,
    }
}

fn typography_input(t: &DocumentTypography) -> DocumentTypographyInput {
    DocumentTypographyInput {
        font_family: Some(t.font_family.clone()),
        font_size: Some(t.font_size),
        line_height: Some(t.line_height),
    }
}

pub fn document_style_presets() -> Vec<DocumentStylePreset> {
    let default_typo = default_document_typography();
    vec![
        DocumentStylePreset {
            id: "default".into(),
            label_key: "pageStyles.presets.default.label".into(),
            description_key: "pageStyles.presets.default.description".into(),
            page_setup: default_page_setup(),
            typography: default_typo,
        },
        {
            let typo = typography("Georgia, \"Times New Roman\", Times, serif", 16.0, 1.85);
            DocumentStylePreset {
                id: "academic".into(),
                label_key: "pageStyles.presets.academic.label".into(),
                description_key: "pageStyles.presets.academic.description".into(),
                page_setup: PageSetup {
                    paper_size: "a4".into(),
                    margin_top: 96.0,
                    margin_bottom: 96.0,
                    margin_left: 104.0,
                    margin_right: 104.0,
                    header_footer: PageHeaderFooter {
                        enabled: true,
                        header_text: "{title}".into(),
                        footer_text: String::new(),
                        show_page_number: true,
                    },
                    watermark: default_watermark(),
                    first_page: default_first_page(),
                    typography: Some(typography_input(&typo)),
                    style_preset_id: Some("academic".into()),
                },
                typography: typo,
            }
        },
        {
            let typo = typography(
                "-apple-system, BlinkMacSystemFont, \"SF Pro Text\", Helvetica, Arial, sans-serif",
                15.0,
                1.55,
            );
            DocumentStylePreset {
                id: "letter".into(),
                label_key: "pageStyles.presets.letter.label".into(),
                description_key: "pageStyles.presets.letter.description".into(),
                page_setup: PageSetup {
                    paper_size: "letter".into(),
                    margin_top: 72.0,
                    margin_bottom: 72.0,
                    margin_left: 88.0,
                    margin_right: 88.0,
                    header_footer: PageHeaderFooter {
                        enabled: true,
                        header_text: "{title}".into(),
                        footer_text: "{date}".into(),
                        show_page_number: false,
                    },
                    watermark: default_watermark(),
                    first_page: FirstPageOptions {
                        different: true,
                        hide_header_footer: true,
                    },
                    typography: Some(typography_input(&typo)),
                    style_preset_id: Some("letter".into()),
                },
                typography: typo,
            }
        },
        {
            let typo = typography("Inter, system-ui, -apple-system, sans-serif", 18.0, 1.75);
            DocumentStylePreset {
                id: "blog".into(),
                label_key: "pageStyles.presets.blog.label".into(),
                description_key: "pageStyles.presets.blog.description".into(),
                page_setup: PageSetup {
                    paper_size: "a4".into(),
                    margin_top: 56.0,
                    margin_bottom: 64.0,
                    margin_left: 72.0,
                    margin_right: 72.0,
                    header_footer: default_header_footer(),
                    watermark: default_watermark(),
                    first_page: default_first_page(),
                    typography: Some(typography_input(&typo)),
                    style_preset_id: Some("blog".into()),
                },
                typography: typo,
            }
        },
        {
            let typo = typography("\"Courier New\", Courier, monospace", 15.0, 2.0);
            DocumentStylePreset {
                id: "manuscript".into(),
                label_key: "pageStyles.presets.manuscript.label".into(),
                description_key: "pageStyles.presets.manuscript.description".into(),
                page_setup: PageSetup {
                    paper_size: "letter".into(),
                    margin_top: 88.0,
                    margin_bottom: 88.0,
                    margin_left: 96.0,
                    margin_right: 96.0,
                    header_footer: PageHeaderFooter {
                        enabled: true,
                        header_text: "{title}".into(),
                        footer_text: String::new(),
                        show_page_number: true,
                    },
                    watermark: default_watermark(),
                    first_page: default_first_page(),
                    typography: Some(typography_input(&typo)),
                    style_preset_id: Some("manuscript".into()),
                },
                typography: typo,
            }
        },
    ]
}

pub fn document_style_preset_ids() -> Vec<String> {
    document_style_presets()
        .into_iter()
        .map(|p| p.id)
        .collect()
}

pub fn get_document_style_preset(id: &str) -> DocumentStylePreset {
    document_style_presets()
        .into_iter()
        .find(|p| p.id == id)
        .unwrap_or_else(|| document_style_presets()[0].clone())
}

pub fn apply_document_style_preset(id: &str) -> PageSetup {
    let preset = get_document_style_preset(id);
    let mut setup = preset.page_setup;
    setup.typography = Some(typography_input(&preset.typography));
    setup.style_preset_id = Some(preset.id);
    setup
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets() {
        assert!(document_style_preset_ids().contains(&"academic".to_string()));
        let setup = apply_document_style_preset("manuscript");
        assert_eq!(setup.paper_size, "letter");
        assert_eq!(setup.style_preset_id.as_deref(), Some("manuscript"));
    }
}
