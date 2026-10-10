//! Canvas document model: parse / normalize / serialize (`src/lib/canvas/types.ts`).

use serde::{Deserialize, Serialize, Serializer};
use serde_json::Value;

pub const CANVAS_CONTENT_TYPE: &str = "canvas";
pub const CANVAS_VERSION: u32 = 1;
pub const DEFAULT_CARD_W: f64 = 200.0;
pub const DEFAULT_CARD_H: f64 = 120.0;
/// Cards must be strictly larger than this on each axis to keep their size.
const MIN_CARD_SIZE: f64 = 40.0;

/// Emit whole numbers as integers (`120`, not `120.0`) to match JS `JSON.stringify`.
fn ser_num<S: Serializer>(v: &f64, s: S) -> Result<S::Ok, S::Error> {
    if v.fract() == 0.0 && v.abs() < 9.0e15 {
        s.serialize_i64(*v as i64)
    } else {
        s.serialize_f64(*v)
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasEdge {
    pub id: String,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasDocument {
    #[serde(rename = "type")]
    pub doc_type: String,
    pub version: u32,
    pub cards: Vec<CanvasCard>,
    pub edges: Vec<CanvasEdge>,
}

pub fn empty_canvas_document() -> CanvasDocument {
    CanvasDocument {
        doc_type: CANVAS_CONTENT_TYPE.into(),
        version: CANVAS_VERSION,
        cards: Vec::new(),
        edges: Vec::new(),
    }
}

/// `type == "canvas"`, version `1` or absent, with `cards` and `edges` arrays.
pub fn is_canvas_content(value: &Value) -> bool {
    let Some(record) = value.as_object() else {
        return false;
    };
    let version_ok = match record.get("version") {
        None => true,
        Some(v) => v.as_f64() == Some(1.0),
    };
    record.get("type").and_then(Value::as_str) == Some(CANVAS_CONTENT_TYPE)
        && version_ok
        && record.get("cards").is_some_and(Value::is_array)
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

/// Parse stored canvas JSON; `None` for invalid JSON or non-canvas content.
pub fn parse_canvas_document(content_json: &str) -> Option<CanvasDocument> {
    let parsed: Value = serde_json::from_str(content_json).ok()?;
    if !is_canvas_content(&parsed) {
        return None;
    }
    let cards = parsed["cards"].as_array()?.iter().map(normalize_card).collect();
    let edges = parsed["edges"].as_array()?.iter().filter_map(normalize_edge).collect();
    Some(CanvasDocument {
        doc_type: CANVAS_CONTENT_TYPE.into(),
        version: CANVAS_VERSION,
        cards,
        edges,
    })
}

pub fn serialize_canvas_document(doc: &CanvasDocument) -> String {
    let canonical = CanvasDocument {
        doc_type: CANVAS_CONTENT_TYPE.into(),
        version: CANVAS_VERSION,
        cards: doc.cards.clone(),
        edges: doc.edges.clone(),
    };
    serde_json::to_string(&canonical).unwrap_or_else(|_| "{}".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_roundtrip() {
        let s = serialize_canvas_document(&empty_canvas_document());
        assert_eq!(s, r#"{"type":"canvas","version":1,"cards":[],"edges":[]}"#);
        assert_eq!(parse_canvas_document(&s), Some(empty_canvas_document()));
    }

    #[test]
    fn rejects_non_canvas() {
        assert!(parse_canvas_document("not json").is_none());
        assert!(parse_canvas_document(r#"{"type":"doc"}"#).is_none());
        assert!(parse_canvas_document(r#"{"type":"canvas","version":2,"cards":[],"edges":[]}"#).is_none());
        assert!(parse_canvas_document(r#"{"type":"canvas","version":null,"cards":[],"edges":[]}"#).is_none());
        assert!(parse_canvas_document(r#"{"type":"canvas","cards":{},"edges":[]}"#).is_none());
    }

    #[test]
    fn accepts_missing_version() {
        let doc = parse_canvas_document(r#"{"type":"canvas","cards":[],"edges":[]}"#).unwrap();
        assert_eq!(doc.version, 1);
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
    fn serializes_integers_compactly() {
        let doc = CanvasDocument {
            cards: vec![CanvasCard { id: "c".into(), x: 1.0, y: -2.5, w: 200.0, h: 120.0, text: "t".into() }],
            edges: vec![CanvasEdge { id: "e".into(), from: "c".into(), to: "d".into() }],
            ..empty_canvas_document()
        };
        assert_eq!(
            serialize_canvas_document(&doc),
            r#"{"type":"canvas","version":1,"cards":[{"id":"c","x":1,"y":-2.5,"w":200,"h":120,"text":"t"}],"edges":[{"id":"e","from":"c","to":"d"}]}"#
        );
    }
}
