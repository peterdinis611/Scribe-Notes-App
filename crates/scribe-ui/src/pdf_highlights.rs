//! PDF highlight import model + TipTap doc builder (`src/lib/import/pdf-highlights.ts`).
//!
//! The pdf.js extraction (`getDocument`, `getAnnotations`, `getTextContent`) stays in the
//! frontend; this module owns everything that is pure: color conversion, quad-point text
//! matching, annotation filtering and `pdfHighlightsToContentJson`.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Default TipTap highlight color when the annotation has no usable color.
pub const DEFAULT_HIGHLIGHT_HEX: &str = "#fef08a";

/// Annotation subtypes treated as highlights.
pub const HIGHLIGHT_SUBTYPES: &[&str] = &["Highlight", "Underline", "Squiggly", "StrikeOut"];

/// One highlight/underline annotation extracted from a PDF.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PdfHighlightAnnotation {
    pub page: u32,
    pub text: String,
    pub color: Option<String>,
    pub subtype: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PdfHighlightsImport {
    pub file_name: String,
    pub page_count: u32,
    pub highlights: Vec<PdfHighlightAnnotation>,
}

/// A pdf.js text item: its string and 6-number transform matrix (`[a,b,c,d,x,y]`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PdfTextItem {
    #[serde(default, rename = "str")]
    pub text: Option<String>,
    #[serde(default)]
    pub transform: Option<Vec<f64>>,
}

pub fn is_highlight_subtype(subtype: &str) -> bool {
    HIGHLIGHT_SUBTYPES.contains(&subtype)
}

/// JS `Math.round` (ties toward +infinity).
fn js_round(x: f64) -> f64 {
    (x + 0.5).floor()
}

fn to_byte(v: f64) -> u32 {
    js_round(v.clamp(0.0, 1.0) * 255.0) as u32
}

/// JS `Number.prototype.toFixed(2)` for values in `[0, 1]` (ties round up, not to even).
fn to_fixed_2(x: f64) -> String {
    // Exact binary ties at 2 decimals only exist for odd multiples of 1/8.
    let eighths = x * 8.0;
    if eighths.fract() == 0.0 && (eighths as i64) % 2 != 0 {
        return format!("{:.2}", x + 0.001);
    }
    format!("{x:.2}")
}

/// pdf.js color components in `0..=1` → CSS `rgb(...)` / `rgba(...)`; `None` when < 3 components.
pub fn rgba_to_css(color: Option<&[f64]>) -> Option<String> {
    let color = color?;
    if color.len() < 3 {
        return None;
    }
    let (r, g, b) = (to_byte(color[0]), to_byte(color[1]), to_byte(color[2]));
    if color.len() >= 4 {
        let alpha = color[3].clamp(0.0, 1.0);
        return Some(format!("rgba({r}, {g}, {b}, {})", to_fixed_2(alpha)));
    }
    Some(format!("rgb({r}, {g}, {b})"))
}

/// First `rgb(r, g, b)` / `rgba(r, g, b, ...)` triplet in `input` (case-insensitive),
/// mirroring `/rgba?\((\d+),\s*(\d+),\s*(\d+)/i`.
pub fn parse_rgb_triplet(input: &str) -> Option<(u64, u64, u64)> {
    let lower = input.to_ascii_lowercase();
    let bytes = lower.as_bytes();

    fn digits(bytes: &[u8], mut i: usize) -> Option<(u64, usize)> {
        let start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        if i == start {
            return None;
        }
        let value = std::str::from_utf8(&bytes[start..i]).ok()?.parse::<u64>().unwrap_or(u64::MAX);
        Some((value, i))
    }
    fn skip_ws(bytes: &[u8], mut i: usize) -> usize {
        while i < bytes.len() && (bytes[i] as char).is_ascii_whitespace() {
            i += 1;
        }
        i
    }
    fn comma(bytes: &[u8], i: usize) -> Option<usize> {
        (bytes.get(i) == Some(&b',')).then(|| skip_ws(bytes, i + 1))
    }

    let mut from = 0;
    while let Some(offset) = lower[from..].find("rgb") {
        let mut i = from + offset + 3;
        from += offset + 1;
        if bytes.get(i) == Some(&b'a') {
            i += 1;
        }
        if bytes.get(i) != Some(&b'(') {
            continue;
        }
        let attempt = (|| {
            let (r, i) = digits(bytes, i + 1)?;
            let i = comma(bytes, i)?;
            let (g, i) = digits(bytes, i)?;
            let i = comma(bytes, i)?;
            let (b, _) = digits(bytes, i)?;
            Some((r, g, b))
        })();
        if attempt.is_some() {
            return attempt;
        }
    }
    None
}

/// CSS color string → solid `#rrggbb` for the TipTap highlight mark.
pub fn map_to_tiptap_highlight(color: Option<&str>) -> String {
    let Some((r, g, b)) = color.and_then(parse_rgb_triplet) else {
        return DEFAULT_HIGHLIGHT_HEX.to_string();
    };
    format!("#{r:02x}{g:02x}{b:02x}")
}

/// Join the text of items whose origin falls inside any quad's bounding box (±2pt).
///
/// `quad_points` holds 8 numbers per quad (`x1,y1 … x4,y4`); fewer than 8 yields `""`.
pub fn extract_text_from_quad_points(quad_points: &[f64], items: &[PdfTextItem]) -> String {
    if quad_points.len() < 8 {
        return String::new();
    }
    struct BBox {
        x_min: f64,
        x_max: f64,
        y_min: f64,
        y_max: f64,
    }
    let boxes: Vec<BBox> = quad_points
        .chunks_exact(8)
        .map(|q| {
            let xs = [q[0], q[2], q[4], q[6]];
            let ys = [q[1], q[3], q[5], q[7]];
            BBox {
                x_min: xs.iter().copied().fold(f64::INFINITY, f64::min),
                x_max: xs.iter().copied().fold(f64::NEG_INFINITY, f64::max),
                y_min: ys.iter().copied().fold(f64::INFINITY, f64::min),
                y_max: ys.iter().copied().fold(f64::NEG_INFINITY, f64::max),
            }
        })
        .collect();

    let mut parts: Vec<&str> = Vec::new();
    for item in items {
        let (Some(text), Some(transform)) = (item.text.as_deref(), item.transform.as_deref()) else {
            continue;
        };
        if text.is_empty() {
            continue;
        }
        let x = transform.get(4).copied().unwrap_or(0.0);
        let y = transform.get(5).copied().unwrap_or(0.0);
        let inside = boxes
            .iter()
            .any(|b| x >= b.x_min - 2.0 && x <= b.x_max + 2.0 && y >= b.y_min - 2.0 && y <= b.y_max + 2.0);
        if inside {
            parts.push(text);
        }
    }
    parts.join(" ").split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Turn a raw pdf.js annotation into a highlight; `None` for other subtypes or empty text.
///
/// Text comes from `contentsObj.str`, else `contents`, else the quad-point text lookup.
pub fn highlight_from_annotation(
    page: u32,
    annotation: &Value,
    page_text_items: &[PdfTextItem],
) -> Option<PdfHighlightAnnotation> {
    let subtype = match annotation.get("subtype") {
        Some(Value::String(s)) => s.as_str(),
        _ => "",
    };
    if !is_highlight_subtype(subtype) {
        return None;
    }

    let contents = match annotation.get("contentsObj") {
        Some(Value::Object(obj)) => obj.get("str").and_then(Value::as_str).unwrap_or("").to_string(),
        _ => annotation.get("contents").and_then(Value::as_str).unwrap_or("").to_string(),
    };
    let mut text = contents.trim().to_string();

    if text.is_empty() {
        let quads: Vec<f64> = annotation
            .get("quadPoints")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_f64).collect())
            .unwrap_or_default();
        text = extract_text_from_quad_points(&quads, page_text_items);
    }
    if text.is_empty() {
        return None;
    }

    let color: Option<Vec<f64>> = annotation
        .get("color")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_f64).collect());

    Some(PdfHighlightAnnotation {
        page,
        text,
        color: rgba_to_css(color.as_deref()),
        subtype: subtype.to_string(),
    })
}

fn italic_paragraph(text: String) -> Value {
    json!({
        "type": "paragraph",
        "content": [{ "type": "text", "text": text, "marks": [{ "type": "italic" }] }],
    })
}

fn heading(level: u8, text: String) -> Value {
    json!({
        "type": "heading",
        "attrs": { "level": level },
        "content": [{ "type": "text", "text": text }],
    })
}

/// Build the TipTap doc JSON for imported PDF highlights.
pub fn pdf_highlights_to_content_json(imported: &PdfHighlightsImport) -> Value {
    let mut content = vec![
        heading(2, format!("Highlights · {}", imported.file_name)),
        italic_paragraph(format!(
            "{} annotation(s) from {} page(s).",
            imported.highlights.len(),
            imported.page_count
        )),
    ];

    let mut current_page: Option<u32> = None;
    for item in &imported.highlights {
        if current_page != Some(item.page) {
            current_page = Some(item.page);
            content.push(heading(3, format!("Page {}", item.page)));
        }
        content.push(json!({
            "type": "paragraph",
            "content": [{
                "type": "text",
                "text": item.text,
                "marks": [{
                    "type": "highlight",
                    "attrs": { "color": map_to_tiptap_highlight(item.color.as_deref()) },
                }],
            }],
        }));
    }

    if imported.highlights.is_empty() {
        content.push(italic_paragraph(
            "No highlight/underline annotations found in this PDF.".to_string(),
        ));
    }

    json!({ "type": "doc", "content": content })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hl(page: u32, text: &str, color: Option<&str>) -> PdfHighlightAnnotation {
        PdfHighlightAnnotation {
            page,
            text: text.into(),
            color: color.map(Into::into),
            subtype: "Highlight".into(),
        }
    }

    #[test]
    fn converts_colors() {
        assert_eq!(rgba_to_css(Some(&[1.0, 0.5, 0.0])).as_deref(), Some("rgb(255, 128, 0)"));
        assert_eq!(
            rgba_to_css(Some(&[2.0, -1.0, 0.0, 0.5])).as_deref(),
            Some("rgba(255, 0, 0, 0.50)")
        );
        assert_eq!(rgba_to_css(Some(&[1.0, 1.0])), None);
        assert_eq!(rgba_to_css(None), None);
    }

    #[test]
    fn alpha_rounds_like_js_to_fixed() {
        assert_eq!(rgba_to_css(Some(&[0.0, 0.0, 0.0, 0.125])).unwrap(), "rgba(0, 0, 0, 0.13)");
        assert_eq!(rgba_to_css(Some(&[0.0, 0.0, 0.0, 0.375])).unwrap(), "rgba(0, 0, 0, 0.38)");
        assert_eq!(rgba_to_css(Some(&[0.0, 0.0, 0.0, 0.3])).unwrap(), "rgba(0, 0, 0, 0.30)");
        assert_eq!(rgba_to_css(Some(&[0.0, 0.0, 0.0, 1.0])).unwrap(), "rgba(0, 0, 0, 1.00)");
    }

    #[test]
    fn maps_highlight_colors() {
        assert_eq!(map_to_tiptap_highlight(Some("rgb(255, 128, 0)")), "#ff8000");
        assert_eq!(map_to_tiptap_highlight(Some("RGBA(1,2,3, 0.5)")), "#010203");
        assert_eq!(map_to_tiptap_highlight(Some("red")), DEFAULT_HIGHLIGHT_HEX);
        assert_eq!(map_to_tiptap_highlight(None), DEFAULT_HIGHLIGHT_HEX);
        // Out-of-range channel keeps JS `toString(16)` width semantics.
        assert_eq!(map_to_tiptap_highlight(Some("rgb(300,0,0)")), "#12c0000");
    }

    #[test]
    fn rgb_triplet_scanner() {
        assert_eq!(parse_rgb_triplet("rgb(1, 2,   3)"), Some((1, 2, 3)));
        assert_eq!(parse_rgb_triplet("color: rgba(10,20,30,0.4)"), Some((10, 20, 30)));
        assert_eq!(parse_rgb_triplet("rgb (1,2,3)"), None);
        assert_eq!(parse_rgb_triplet("rgb(1 ,2,3)"), None);
        assert_eq!(parse_rgb_triplet("rgbx(1,2,3) rgb(4,5,6)"), Some((4, 5, 6)));
    }

    #[test]
    fn quad_point_text_lookup() {
        let items = vec![
            PdfTextItem { text: Some("inside".into()), transform: Some(vec![1.0, 0.0, 0.0, 1.0, 50.0, 50.0]) },
            PdfTextItem { text: Some("edge".into()), transform: Some(vec![1.0, 0.0, 0.0, 1.0, 101.5, 50.0]) },
            PdfTextItem { text: Some("outside".into()), transform: Some(vec![1.0, 0.0, 0.0, 1.0, 300.0, 50.0]) },
            PdfTextItem { text: Some("notransform".into()), transform: None },
            PdfTextItem { text: Some("".into()), transform: Some(vec![0.0; 6]) },
        ];
        let quad = [10.0, 40.0, 100.0, 40.0, 10.0, 60.0, 100.0, 60.0];
        assert_eq!(extract_text_from_quad_points(&quad, &items), "inside edge");
        assert_eq!(extract_text_from_quad_points(&quad[..7], &items), "");
    }

    #[test]
    fn annotation_filtering() {
        let items = vec![PdfTextItem {
            text: Some("from quads".into()),
            transform: Some(vec![0.0, 0.0, 0.0, 0.0, 5.0, 5.0]),
        }];
        let ann = json!({
            "subtype": "Highlight",
            "color": [1.0, 1.0, 0.0],
            "contents": "  ",
            "quadPoints": [0, 0, 10, 0, 0, 10, 10, 10]
        });
        let got = highlight_from_annotation(2, &ann, &items).unwrap();
        assert_eq!(got.text, "from quads");
        assert_eq!(got.color.as_deref(), Some("rgb(255, 255, 0)"));

        let with_contents = json!({ "subtype": "Underline", "contentsObj": { "str": " hello " } });
        assert_eq!(highlight_from_annotation(1, &with_contents, &[]).unwrap().text, "hello");

        assert!(highlight_from_annotation(1, &json!({ "subtype": "Text", "contents": "x" }), &[]).is_none());
        assert!(highlight_from_annotation(1, &json!({ "subtype": "Highlight" }), &[]).is_none());
    }

    #[test]
    fn builds_content_json() {
        let doc = pdf_highlights_to_content_json(&PdfHighlightsImport {
            file_name: "paper.pdf".into(),
            page_count: 3,
            highlights: vec![
                hl(1, "a", Some("rgb(255, 255, 0)")),
                hl(1, "b", None),
                hl(3, "c", None),
            ],
        });
        let content = doc["content"].as_array().unwrap();
        assert_eq!(doc["type"], "doc");
        // title + summary + (page 1 heading + 2) + (page 3 heading + 1)
        assert_eq!(content.len(), 2 + 3 + 2);
        assert_eq!(content[0]["content"][0]["text"], "Highlights · paper.pdf");
        assert_eq!(content[1]["content"][0]["text"], "3 annotation(s) from 3 page(s).");
        assert_eq!(content[2]["content"][0]["text"], "Page 1");
        assert_eq!(content[3]["content"][0]["marks"][0]["attrs"]["color"], "#ffff00");
        assert_eq!(content[4]["content"][0]["marks"][0]["attrs"]["color"], DEFAULT_HIGHLIGHT_HEX);
        assert_eq!(content[5]["content"][0]["text"], "Page 3");
    }

    #[test]
    fn empty_import_gets_placeholder() {
        let doc = pdf_highlights_to_content_json(&PdfHighlightsImport {
            file_name: "x.pdf".into(),
            page_count: 0,
            highlights: vec![],
        });
        let content = doc["content"].as_array().unwrap();
        assert_eq!(content.len(), 3);
        assert_eq!(
            content[2]["content"][0]["text"],
            "No highlight/underline annotations found in this PDF."
        );
    }

    #[test]
    fn serde_is_camel_case() {
        let v = serde_json::to_value(PdfHighlightsImport {
            file_name: "a.pdf".into(),
            page_count: 1,
            highlights: vec![hl(1, "t", None)],
        })
        .unwrap();
        assert_eq!(v["fileName"], "a.pdf");
        assert_eq!(v["pageCount"], 1);
        assert!(v["highlights"][0]["color"].is_null());
        let item: PdfTextItem = serde_json::from_value(json!({ "str": "x", "transform": [1, 0, 0, 1, 2, 3] })).unwrap();
        assert_eq!(item.text.as_deref(), Some("x"));
    }
}
