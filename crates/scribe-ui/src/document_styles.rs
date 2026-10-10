//! Shared document typography / print CSS builders ported from `src/lib/export/document-styles.ts`.

use serde::{Deserialize, Serialize};

pub const DOCUMENT_BODY_FONT: &str =
    "-apple-system, BlinkMacSystemFont, \"Helvetica Neue\", Helvetica, Arial, sans-serif";

pub const DEFAULT_DOCUMENT_FONT_SIZE: f64 = 16.0;
pub const DEFAULT_DOCUMENT_LINE_HEIGHT: f64 = 1.7;

/// Partial typography as stored on `PageSetup.typography` (any field may be missing).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTypographyInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTypography {
    pub font_family: String,
    pub font_size: f64,
    pub line_height: f64,
}

impl Default for DocumentTypography {
    fn default() -> Self {
        Self {
            font_family: DOCUMENT_BODY_FONT.into(),
            font_size: DEFAULT_DOCUMENT_FONT_SIZE,
            line_height: DEFAULT_DOCUMENT_LINE_HEIGHT,
        }
    }
}

/// Fill in defaults for missing typography fields (`resolveDocumentTypography`).
pub fn resolve_document_typography(input: Option<&DocumentTypographyInput>) -> DocumentTypography {
    let d = DocumentTypography::default();
    match input {
        Some(t) => DocumentTypography {
            font_family: t.font_family.clone().unwrap_or(d.font_family),
            font_size: t.font_size.unwrap_or(d.font_size),
            line_height: t.line_height.unwrap_or(d.line_height),
        },
        None => d,
    }
}

/// px → pt at 96dpi, rounded.
pub fn px_to_pt(px: f64) -> i64 {
    ((px * 72.0) / 96.0).round() as i64
}

/// Body typography block for print / HTML export (`buildDocumentContentCss`).
pub fn build_document_content_css(typography: Option<&DocumentTypographyInput>) -> String {
    let t = resolve_document_typography(typography);
    let family = t.font_family.trim();
    let font_family = if family.is_empty() { DOCUMENT_BODY_FONT } else { family };
    format!(
        "\n  font-family: {font_family};\n  font-size: {}pt;\n  line-height: {};\n  letter-spacing: 0;\n  color: #111111;\n",
        px_to_pt(t.font_size),
        t.line_height
    )
}

pub fn document_content_css() -> String {
    build_document_content_css(None)
}

pub const DOCUMENT_TIPTAP_CSS: &str = r#"
  .document-content h1 { font-size: 24pt; font-weight: 700; margin: 0 0 12pt; line-height: 1.15; }
  .document-content h2 { font-size: 18pt; font-weight: 600; margin: 18pt 0 8pt; line-height: 1.2; }
  .document-content h3 { font-size: 14pt; font-weight: 600; margin: 14pt 0 6pt; line-height: 1.25; }
  .document-content h4 { font-size: 12pt; font-weight: 600; margin: 12pt 0 4pt; }
  .document-content h5 { font-size: 11pt; font-weight: 600; margin: 10pt 0 4pt; }
  .document-content h6 { font-size: 10pt; font-weight: 600; margin: 8pt 0 4pt; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
  .document-content p { margin: 0 0 10pt; }
  .document-content ul:not([data-type='taskList']), .document-content ol { margin: 0 0 10pt; padding-left: 20pt; }
  .document-content li { margin: 0 0 4pt; }
  .document-content blockquote { border-left: 3px solid #ccc; padding-left: 12pt; color: #555; margin: 0 0 10pt; }
  .document-content pre { background: #0d1117; color: #e6edf3; padding: 10pt; border-radius: 6pt; overflow-x: auto; margin: 0 0 10pt; }
  .document-content pre code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10pt; }
  .document-content code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10pt; background: #f3f4f6; padding: 1pt 4pt; border-radius: 4pt; }
  .document-content mark { background: #fff3a3; }
  .document-content table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
  .document-content th, .document-content td { border: 1px solid #ccc; padding: 8pt; text-align: left; }
  .document-content img { max-width: 100%; height: auto; }
  .document-content hr { border: none; border-top: 1px solid #ddd; margin: 16pt 0; }
"#;

pub const DOCUMENT_HIGHLIGHT_CSS: &str = r#"
  .hljs-comment, .hljs-quote { color: #8b949e; }
  .hljs-keyword, .hljs-selector-tag { color: #ff7b72; }
  .hljs-string, .hljs-addition { color: #a5d6ff; }
  .hljs-number, .hljs-literal { color: #79c0ff; }
  .hljs-title, .hljs-section { color: #d2a8ff; }
  .hljs-built_in, .hljs-type { color: #ffa657; }
  .hljs-attr, .hljs-variable { color: #79c0ff; }
"#;

/// Extra rules for print / native PDF — force readable light paper regardless of app theme.
pub const PDF_CAPTURE_CSS: &str = r#"
  html {
    color-scheme: light only;
    background: #ffffff;
  }
  body,
  .document-content {
    background: #ffffff !important;
    color: #111111 !important;
  }
  .document-content p,
  .document-content li,
  .document-content blockquote,
  .document-content td,
  .document-content th {
    color: inherit;
  }
"#;

pub fn build_watermark_css(opacity: f64, angle: f64) -> String {
    format!(
        r#"
    .export-watermark, .print-watermark {{
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 0;
    }}
    .export-watermark span, .print-watermark span {{
      transform: rotate({angle}deg);
      font-size: 56pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: rgba(120, 120, 120, {opacity});
      text-transform: uppercase;
      user-select: none;
    }}
  "#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_content_css_uses_body_font_and_12pt() {
        let css = document_content_css();
        assert!(css.contains(DOCUMENT_BODY_FONT));
        assert!(css.contains("font-size: 12pt;"));
        assert!(css.contains("line-height: 1.7;"));
    }

    #[test]
    fn custom_typography_overrides() {
        let t = DocumentTypographyInput {
            font_family: Some("Georgia, serif".into()),
            font_size: Some(18.0),
            line_height: Some(2.0),
        };
        let css = build_document_content_css(Some(&t));
        assert!(css.contains("font-family: Georgia, serif;"));
        assert!(css.contains("font-size: 14pt;"));
        assert!(css.contains("line-height: 2;"));
    }

    #[test]
    fn blank_family_falls_back() {
        let t = DocumentTypographyInput { font_family: Some("   ".into()), ..Default::default() };
        assert!(build_document_content_css(Some(&t)).contains(DOCUMENT_BODY_FONT));
    }

    #[test]
    fn watermark_css_embeds_values() {
        let css = build_watermark_css(0.12, -35.0);
        assert!(css.contains("rotate(-35deg)"));
        assert!(css.contains("rgba(120, 120, 120, 0.12)"));
    }

    #[test]
    fn typography_input_camel_case() {
        let t: DocumentTypographyInput =
            serde_json::from_str(r#"{"fontFamily":"X","fontSize":15}"#).unwrap();
        assert_eq!(t.font_family.as_deref(), Some("X"));
        assert_eq!(resolve_document_typography(Some(&t)).line_height, 1.7);
    }
}
