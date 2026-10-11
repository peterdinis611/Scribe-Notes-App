//! Canvas document model: parse / normalize / serialize (`src/lib/canvas/types.ts`).

use serde::{Deserialize, Serialize, Serializer};
use serde_json::Value;

pub const CANVAS_CONTENT_TYPE: &str = "canvas";
pub const CANVAS_VERSION: u32 = 2;
pub const DEFAULT_CARD_W: f64 = 200.0;
pub const DEFAULT_CARD_H: f64 = 120.0;
pub const DEFAULT_FRAME_W: f64 = 360.0;
pub const DEFAULT_FRAME_H: f64 = 240.0;
pub const DEFAULT_SHAPE_W: f64 = 160.0;
pub const DEFAULT_SHAPE_H: f64 = 120.0;
pub const DEFAULT_TEXT_W: f64 = 180.0;
pub const DEFAULT_TEXT_H: f64 = 48.0;
pub const DEFAULT_LINE_W: f64 = 160.0;
pub const DEFAULT_LINE_H: f64 = 24.0;
pub const DEFAULT_DOCLINK_W: f64 = 220.0;
pub const DEFAULT_DOCLINK_H: f64 = 64.0;
/// Cards/objects must be strictly larger than this on each axis to keep their size.
const MIN_CARD_SIZE: f64 = 40.0;
const MIN_OBJECT_SIZE: f64 = 24.0;
const MIN_LINE_SIZE: f64 = 8.0;

/// Emit whole numbers as integers (`120`, not `120.0`) to match JS `JSON.stringify`.
pub(crate) fn ser_num<S: Serializer>(v: &f64, s: S) -> Result<S::Ok, S::Error> {
    if v.fract() == 0.0 && v.abs() < 9.0e15 {
        s.serialize_i64(*v as i64)
    } else {
        s.serialize_f64(*v)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CanvasObjectKind {
    Note,
    Frame,
    Rect,
    Ellipse,
    Text,
    Line,
    Arrow,
    #[serde(rename = "docLink")]
    DocLink,
}

impl CanvasObjectKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Note => "note",
            Self::Frame => "frame",
            Self::Rect => "rect",
            Self::Ellipse => "ellipse",
            Self::Text => "text",
            Self::Line => "line",
            Self::Arrow => "arrow",
            Self::DocLink => "docLink",
        }
    }

    pub fn parse(raw: Option<&str>) -> Self {
        match raw {
            Some("frame") => Self::Frame,
            Some("rect") => Self::Rect,
            Some("ellipse") => Self::Ellipse,
            Some("text") => Self::Text,
            Some("line") => Self::Line,
            Some("arrow") => Self::Arrow,
            Some("docLink") => Self::DocLink,
            _ => Self::Note,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasCard {
    pub id: String,
    #[serde(serialize_with = "ser_num")]
    pub x: f64,
    #[serde(serialize_with = "ser_num")]
    pub y: f64,
    #[serde(serialize_with = "ser_num")]
    pub w: f64,
    #[serde(serialize_with = "ser_num")]
    pub h: f64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasObject {
    pub id: String,
    pub kind: CanvasObjectKind,
    #[serde(serialize_with = "ser_num")]
    pub x: f64,
    #[serde(serialize_with = "ser_num")]
    pub y: f64,
    #[serde(serialize_with = "ser_num")]
    pub w: f64,
    #[serde(serialize_with = "ser_num")]
    pub h: f64,
    #[serde(serialize_with = "ser_num")]
    pub z_index: f64,
    pub text: String,
    pub label: String,
    pub fill: String,
    pub stroke: String,
    #[serde(serialize_with = "ser_num")]
    pub stroke_width: f64,
    #[serde(serialize_with = "ser_num")]
    pub font_size: f64,
    pub color: String,
    #[serde(default = "default_opacity", serialize_with = "ser_num")]
    pub opacity: f64,
    #[serde(default, serialize_with = "ser_num")]
    pub corner_radius: f64,
    #[serde(default, serialize_with = "ser_num")]
    pub rotation: f64,
    #[serde(default)]
    pub group_id: String,
    #[serde(default)]
    pub document_id: String,
    #[serde(default)]
    pub document_title: String,
}

fn default_opacity() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasEdge {
    pub id: String,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasViewport {
    #[serde(serialize_with = "ser_num")]
    pub x: f64,
    #[serde(serialize_with = "ser_num")]
    pub y: f64,
    #[serde(serialize_with = "ser_num")]
    pub zoom: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasDocument {
    #[serde(rename = "type")]
    pub doc_type: String,
    pub version: u32,
    pub cards: Vec<CanvasCard>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub objects: Vec<CanvasObject>,
    pub edges: Vec<CanvasEdge>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub viewport: Option<CanvasViewport>,
}

pub fn empty_canvas_document() -> CanvasDocument {
    CanvasDocument {
        doc_type: CANVAS_CONTENT_TYPE.into(),
        version: CANVAS_VERSION,
        cards: Vec::new(),
        objects: Vec::new(),
        edges: Vec::new(),
        viewport: None,
    }
}

/// `type == "canvas"`, version `1`/`2` or absent, with `cards` or `objects` plus `edges`.
pub fn is_canvas_content(value: &Value) -> bool {
    let Some(record) = value.as_object() else {
        return false;
    };
    let version_ok = match record.get("version") {
        None => true,
        Some(v) => matches!(v.as_f64(), Some(1.0) | Some(2.0)),
    };
    let has_cards = record.get("cards").is_some_and(Value::is_array);
    let has_objects = record.get("objects").is_some_and(Value::is_array);
    record.get("type").and_then(Value::as_str) == Some(CANVAS_CONTENT_TYPE)
        && version_ok
        && (has_cards || has_objects)
        && record.get("edges").is_some_and(Value::is_array)
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn non_empty_str(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_string)
}

fn finite_num(value: Option<&Value>) -> Option<f64> {
    value.and_then(Value::as_f64).filter(|n| n.is_finite())
}

pub fn normalize_card(raw: &Value) -> CanvasCard {
    let get = |key: &str| raw.as_object().and_then(|o| o.get(key));
    let size = |key: &str, default: f64| match finite_num(get(key)) {
        Some(n) if n > MIN_CARD_SIZE => n,
        _ => default,
    };
    CanvasCard {
        id: non_empty_str(get("id")).unwrap_or_else(new_id),
        x: finite_num(get("x")).unwrap_or(0.0),
        y: finite_num(get("y")).unwrap_or(0.0),
        w: size("w", DEFAULT_CARD_W),
        h: size("h", DEFAULT_CARD_H),
        text: get("text").and_then(Value::as_str).unwrap_or("").to_string(),
    }
}

/// (w, h, fill, stroke, stroke_width, font_size, color, corner_radius)
fn defaults_for_kind(
    kind: CanvasObjectKind,
) -> (f64, f64, &'static str, &'static str, f64, f64, &'static str, f64) {
    match kind {
        CanvasObjectKind::Frame => (
            DEFAULT_FRAME_W,
            DEFAULT_FRAME_H,
            "color-mix(in srgb, var(--color-surface) 88%, transparent)",
            "var(--color-border)",
            1.5,
            12.0,
            "var(--color-muted-foreground)",
            4.0,
        ),
        CanvasObjectKind::Rect => (
            DEFAULT_SHAPE_W,
            DEFAULT_SHAPE_H,
            "color-mix(in srgb, var(--color-accent) 18%, var(--color-surface))",
            "var(--color-accent)",
            1.5,
            14.0,
            "var(--color-foreground)",
            10.0,
        ),
        CanvasObjectKind::Ellipse => (
            DEFAULT_SHAPE_W,
            DEFAULT_SHAPE_H,
            "color-mix(in srgb, var(--color-accent) 18%, var(--color-surface))",
            "var(--color-accent)",
            1.5,
            14.0,
            "var(--color-foreground)",
            999.0,
        ),
        CanvasObjectKind::Text => (
            DEFAULT_TEXT_W,
            DEFAULT_TEXT_H,
            "transparent",
            "transparent",
            0.0,
            18.0,
            "var(--color-foreground)",
            0.0,
        ),
        CanvasObjectKind::Line | CanvasObjectKind::Arrow => (
            DEFAULT_LINE_W,
            DEFAULT_LINE_H,
            "transparent",
            "var(--color-accent)",
            2.0,
            12.0,
            "var(--color-foreground)",
            0.0,
        ),
        CanvasObjectKind::DocLink => (
            DEFAULT_DOCLINK_W,
            DEFAULT_DOCLINK_H,
            "var(--color-surface-elevated)",
            "var(--color-border)",
            1.0,
            13.0,
            "var(--color-foreground)",
            10.0,
        ),
        CanvasObjectKind::Note => (
            DEFAULT_CARD_W,
            DEFAULT_CARD_H,
            "var(--color-surface-elevated)",
            "var(--color-border)",
            1.0,
            14.0,
            "var(--color-foreground)",
            10.0,
        ),
    }
}

pub fn card_to_object(card: &CanvasCard, z_index: f64) -> CanvasObject {
    let (w, h, fill, stroke, stroke_width, font_size, color, corner_radius) =
        defaults_for_kind(CanvasObjectKind::Note);
    CanvasObject {
        id: card.id.clone(),
        kind: CanvasObjectKind::Note,
        x: card.x,
        y: card.y,
        w: if card.w > MIN_OBJECT_SIZE { card.w } else { w },
        h: if card.h > MIN_OBJECT_SIZE { card.h } else { h },
        z_index,
        text: card.text.clone(),
        label: String::new(),
        fill: fill.into(),
        stroke: stroke.into(),
        stroke_width,
        font_size,
        color: color.into(),
        opacity: 1.0,
        corner_radius,
        rotation: 0.0,
        group_id: String::new(),
        document_id: String::new(),
        document_title: String::new(),
    }
}

pub fn object_to_card(object: &CanvasObject) -> Option<CanvasCard> {
    if object.kind != CanvasObjectKind::Note {
        return None;
    }
    Some(CanvasCard {
        id: object.id.clone(),
        x: object.x,
        y: object.y,
        w: object.w,
        h: object.h,
        text: object.text.clone(),
    })
}

pub fn normalize_object(raw: &Value, index: usize) -> CanvasObject {
    let get = |key: &str| raw.as_object().and_then(|o| o.get(key));
    let kind = CanvasObjectKind::parse(get("kind").and_then(Value::as_str));
    let (dw, dh, dfill, dstroke, dsw, dfs, dcolor, dradius) = defaults_for_kind(kind);
    let min_size = match kind {
        CanvasObjectKind::Line | CanvasObjectKind::Arrow => MIN_LINE_SIZE,
        _ => MIN_OBJECT_SIZE,
    };
    let size = |key: &str, default: f64| match finite_num(get(key)) {
        Some(n) if n > min_size => n,
        _ => default,
    };
    CanvasObject {
        id: non_empty_str(get("id")).unwrap_or_else(new_id),
        kind,
        x: finite_num(get("x")).unwrap_or(0.0),
        y: finite_num(get("y")).unwrap_or(0.0),
        w: size("w", dw),
        h: size("h", dh),
        z_index: finite_num(get("zIndex")).unwrap_or(index as f64),
        text: get("text").and_then(Value::as_str).unwrap_or("").to_string(),
        label: get("label").and_then(Value::as_str).unwrap_or("").to_string(),
        fill: get("fill").and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or(dfill).to_string(),
        stroke: get("stroke")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .unwrap_or(dstroke)
            .to_string(),
        stroke_width: finite_num(get("strokeWidth")).filter(|n| *n >= 0.0).unwrap_or(dsw),
        font_size: finite_num(get("fontSize")).filter(|n| *n >= 10.0).unwrap_or(dfs),
        color: get("color")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .unwrap_or(dcolor)
            .to_string(),
        opacity: finite_num(get("opacity"))
            .map(|n| n.clamp(0.0, 1.0))
            .unwrap_or(1.0),
        corner_radius: finite_num(get("cornerRadius"))
            .filter(|n| *n >= 0.0)
            .unwrap_or(dradius),
        rotation: finite_num(get("rotation")).unwrap_or(0.0),
        group_id: get("groupId").and_then(Value::as_str).unwrap_or("").to_string(),
        document_id: get("documentId").and_then(Value::as_str).unwrap_or("").to_string(),
        document_title: get("documentTitle").and_then(Value::as_str).unwrap_or("").to_string(),
    }
}

/// `None` when `from`/`to` are missing, empty, or equal (self-loop).
pub fn normalize_edge(raw: &Value) -> Option<CanvasEdge> {
    let get = |key: &str| raw.as_object().and_then(|o| o.get(key));
    let from = non_empty_str(get("from"))?;
    let to = non_empty_str(get("to"))?;
    if from == to {
        return None;
    }
    Some(CanvasEdge { id: non_empty_str(get("id")).unwrap_or_else(new_id), from, to })
}

fn normalize_viewport(raw: Option<&Value>) -> Option<CanvasViewport> {
    let value = raw?;
    let get = |key: &str| value.as_object().and_then(|o| o.get(key));
    let x = finite_num(get("x"))?;
    let y = finite_num(get("y"))?;
    let zoom = finite_num(get("zoom"))?;
    Some(CanvasViewport {
        x,
        y,
        zoom: zoom.clamp(0.35, 2.5),
    })
}

/// Parse stored canvas JSON; `None` for invalid JSON or non-canvas content.
pub fn parse_canvas_document(content_json: &str) -> Option<CanvasDocument> {
    let parsed: Value = serde_json::from_str(content_json).ok()?;
    if !is_canvas_content(&parsed) {
        return None;
    }
    let edges = parsed["edges"].as_array()?.iter().filter_map(normalize_edge).collect();
    let objects = if let Some(arr) = parsed.get("objects").and_then(Value::as_array) {
        if !arr.is_empty() {
            arr.iter().enumerate().map(|(i, raw)| normalize_object(raw, i)).collect()
        } else if let Some(cards) = parsed.get("cards").and_then(Value::as_array) {
            cards
                .iter()
                .enumerate()
                .map(|(i, raw)| card_to_object(&normalize_card(raw), i as f64))
                .collect()
        } else {
            Vec::new()
        }
    } else {
        parsed["cards"]
            .as_array()?
            .iter()
            .enumerate()
            .map(|(i, raw)| card_to_object(&normalize_card(raw), i as f64))
            .collect()
    };
    let cards = objects.iter().filter_map(object_to_card).collect();
    let viewport = normalize_viewport(parsed.get("viewport"));
    Some(CanvasDocument {
        doc_type: CANVAS_CONTENT_TYPE.into(),
        version: CANVAS_VERSION,
        cards,
        objects,
        edges,
        viewport,
    })
}

pub fn serialize_canvas_document(doc: &CanvasDocument) -> String {
    let objects = if doc.objects.is_empty() {
        doc.cards
            .iter()
            .enumerate()
            .map(|(i, card)| card_to_object(card, i as f64))
            .collect()
    } else {
        doc.objects.clone()
    };
    let cards = objects.iter().filter_map(object_to_card).collect();
    let canonical = CanvasDocument {
        doc_type: CANVAS_CONTENT_TYPE.into(),
        version: CANVAS_VERSION,
        cards,
        objects,
        edges: doc.edges.clone(),
        viewport: doc.viewport.clone(),
    };
    serde_json::to_string(&canonical).unwrap_or_else(|_| "{}".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_roundtrip() {
        let s = serialize_canvas_document(&empty_canvas_document());
        assert_eq!(s, r#"{"type":"canvas","version":2,"cards":[],"edges":[]}"#);
        assert_eq!(parse_canvas_document(&s), Some(empty_canvas_document()));
    }

    #[test]
    fn rejects_non_canvas() {
        assert!(parse_canvas_document("not json").is_none());
        assert!(parse_canvas_document(r#"{"type":"doc"}"#).is_none());
        assert!(parse_canvas_document(r#"{"type":"canvas","version":3,"cards":[],"edges":[]}"#).is_none());
        assert!(parse_canvas_document(r#"{"type":"canvas","version":null,"cards":[],"edges":[]}"#).is_none());
        assert!(parse_canvas_document(r#"{"type":"canvas","cards":{},"edges":[]}"#).is_none());
    }

    #[test]
    fn accepts_v1_and_v2() {
        let v1 = parse_canvas_document(r#"{"type":"canvas","version":1,"cards":[],"edges":[]}"#).unwrap();
        assert_eq!(v1.version, 2);
        let v2 = parse_canvas_document(r#"{"type":"canvas","version":2,"objects":[],"edges":[]}"#).unwrap();
        assert_eq!(v2.version, 2);
    }

    #[test]
    fn accepts_missing_version() {
        let doc = parse_canvas_document(r#"{"type":"canvas","cards":[],"edges":[]}"#).unwrap();
        assert_eq!(doc.version, 2);
    }

    #[test]
    fn migrates_cards_to_objects() {
        let doc = parse_canvas_document(
            r#"{"type":"canvas","cards":[{"id":"a","x":10,"y":20,"w":200,"h":120,"text":"hi"}],"edges":[]}"#,
        )
        .unwrap();
        assert_eq!(doc.objects.len(), 1);
        assert_eq!(doc.objects[0].kind, CanvasObjectKind::Note);
        assert_eq!(doc.objects[0].text, "hi");
        assert_eq!(doc.cards.len(), 1);
    }

    #[test]
    fn normalizes_cards() {
        let doc = parse_canvas_document(
            r#"{"type":"canvas","cards":[
                {"id":"a","x":10,"y":"bad","w":40,"h":300.5,"text":"hi"},
                null,
                {"id":"","text":5}
            ],"edges":[]}"#,
        )
        .unwrap();
        assert_eq!(doc.cards.len(), 3);
        let a = &doc.cards[0];
        assert_eq!((a.x, a.y, a.w, a.h), (10.0, 0.0, DEFAULT_CARD_W, 300.5));
        assert_eq!(a.text, "hi");
        assert!(!doc.cards[1].id.is_empty());
        assert!(!doc.cards[2].id.is_empty());
        assert_eq!(doc.cards[2].text, "");
    }

    #[test]
    fn filters_edges() {
        let doc = parse_canvas_document(
            r#"{"type":"canvas","cards":[],"edges":[
                {"id":"e1","from":"a","to":"b"},
                {"from":"a","to":"a"},
                {"from":"","to":"b"},
                {"from":"a"},
                {"from":"b","to":"c"}
            ]}"#,
        )
        .unwrap();
        assert_eq!(doc.edges.len(), 2);
        assert_eq!(doc.edges[0].id, "e1");
        assert!(!doc.edges[1].id.is_empty());
    }

    #[test]
    fn serializes_objects() {
        let doc = CanvasDocument {
            objects: vec![CanvasObject {
                id: "r".into(),
                kind: CanvasObjectKind::Rect,
                x: 1.0,
                y: -2.5,
                w: 160.0,
                h: 120.0,
                z_index: 0.0,
                text: String::new(),
                label: String::new(),
                fill: "var(--color-surface)".into(),
                stroke: "var(--color-accent)".into(),
                stroke_width: 1.5,
                font_size: 14.0,
                color: "var(--color-foreground)".into(),
                opacity: 1.0,
                corner_radius: 10.0,
                rotation: 0.0,
                group_id: String::new(),
                document_id: String::new(),
                document_title: String::new(),
            }],
            ..empty_canvas_document()
        };
        let s = serialize_canvas_document(&doc);
        assert!(s.contains(r#""version":2"#));
        assert!(s.contains(r#""kind":"rect""#));
        assert!(s.contains(r#""zIndex":0"#));
        let again = parse_canvas_document(&s).unwrap();
        assert_eq!(again.objects[0].kind, CanvasObjectKind::Rect);
    }

    #[test]
    fn kind_as_str_covers_all() {
        assert_eq!(CanvasObjectKind::Note.as_str(), "note");
        assert_eq!(CanvasObjectKind::Frame.as_str(), "frame");
    }
}
