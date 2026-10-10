//! Canvas ↔ React Flow conversion (`src/lib/canvas/flow.ts`).
//!
//! Document types live in `canvas_doc`; this module only models the React Flow node / edge
//! shapes the frontend exchanges (`@xyflow/react` `Node` / `Edge`).

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

use crate::canvas_doc::{
    CanvasCard, CanvasDocument, CanvasEdge, CANVAS_CONTENT_TYPE, CANVAS_VERSION, DEFAULT_CARD_H,
    DEFAULT_CARD_W,
};

pub const CANVAS_NOTE_TYPE: &str = "note";
pub const CANVAS_EDGE_TYPE: &str = "smoothstep";
/// A node dimension must be strictly larger than this to be kept.
const MIN_NODE_SIZE: f64 = 40.0;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct FlowPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct FlowSize {
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CanvasNoteData {
    pub text: String,
}

/// Node produced for the canvas (`CanvasNoteNode`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CanvasNoteNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub position: FlowPosition,
    pub data: CanvasNoteData,
    pub width: f64,
    pub height: f64,
    pub style: FlowSize,
}

/// Node as received from React Flow: only what `flowToCanvasDocument` reads.
/// Unknown fields (`selected`, `dragging`, ...) are ignored.
#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct FlowNode {
    pub id: String,
    pub position: FlowPosition,
    #[serde(default)]
    pub data: Value,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub height: Option<f64>,
    #[serde(default)]
    pub measured: Option<FlowMeasured>,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq)]
pub struct FlowMeasured {
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub height: Option<f64>,
}

fn null_as_empty<'de, D: Deserializer<'de>>(d: D) -> Result<String, D::Error> {
    Ok(Option::<String>::deserialize(d)?.unwrap_or_default())
}

/// React Flow edge; `source` / `target` may be absent or empty on input.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FlowEdge {
    #[serde(default, deserialize_with = "null_as_empty")]
    pub id: String,
    #[serde(default, deserialize_with = "null_as_empty")]
    pub source: String,
    #[serde(default, deserialize_with = "null_as_empty")]
    pub target: String,
    #[serde(default, rename = "type", skip_serializing_if = "Option::is_none")]
    pub edge_type: Option<String>,
}

fn note_node(id: String, x: f64, y: f64, w: f64, h: f64, text: String) -> CanvasNoteNode {
    CanvasNoteNode {
        id,
        node_type: CANVAS_NOTE_TYPE.to_string(),
        position: FlowPosition { x, y },
        data: CanvasNoteData { text },
        width: w,
        height: h,
        style: FlowSize { width: w, height: h },
    }
}

pub fn cards_to_nodes(cards: &[CanvasCard]) -> Vec<CanvasNoteNode> {
    cards
        .iter()
        .map(|c| note_node(c.id.clone(), c.x, c.y, c.w, c.h, c.text.clone()))
        .collect()
}

pub fn canvas_edges_to_flow(edges: &[CanvasEdge]) -> Vec<FlowEdge> {
    edges
        .iter()
        .map(|e| FlowEdge {
            id: e.id.clone(),
            source: e.from.clone(),
            target: e.to.clone(),
            edge_type: Some(CANVAS_EDGE_TYPE.to_string()),
        })
        .collect()
}

/// `width ?? measured.width ?? DEFAULT`, falling back to the default when not finite / ≤ 40.
fn node_size(node: &FlowNode) -> (f64, f64) {
    let width = node.width.or(node.measured.and_then(|m| m.width)).unwrap_or(DEFAULT_CARD_W);
    let height = node.height.or(node.measured.and_then(|m| m.height)).unwrap_or(DEFAULT_CARD_H);
    (
        if width.is_finite() && width > MIN_NODE_SIZE { width } else { DEFAULT_CARD_W },
        if height.is_finite() && height > MIN_NODE_SIZE { height } else { DEFAULT_CARD_H },
    )
}

/// React Flow nodes + edges → canvas document (self-loops and dangling edges dropped).
pub fn flow_to_canvas_document(nodes: &[FlowNode], edges: &[FlowEdge]) -> CanvasDocument {
    CanvasDocument {
        doc_type: CANVAS_CONTENT_TYPE.to_string(),
        version: CANVAS_VERSION,
        cards: nodes
            .iter()
            .map(|node| {
                let (w, h) = node_size(node);
                CanvasCard {
                    id: node.id.clone(),
                    x: node.position.x,
                    y: node.position.y,
                    w,
                    h,
                    text: node.data.get("text").and_then(Value::as_str).unwrap_or("").to_string(),
                }
            })
            .collect(),
        edges: edges
            .iter()
            .filter(|e| !e.source.is_empty() && !e.target.is_empty() && e.source != e.target)
            .map(|e| CanvasEdge { id: e.id.clone(), from: e.source.clone(), to: e.target.clone() })
            .collect(),
    }
}

/// New note centered on `position` with a fresh UUID.
pub fn create_note_node(position: FlowPosition, text: &str) -> CanvasNoteNode {
    create_note_node_with_id(uuid::Uuid::new_v4().to_string(), position, text)
}

/// Deterministic variant of [`create_note_node`] (caller supplies the id).
pub fn create_note_node_with_id(id: String, position: FlowPosition, text: &str) -> CanvasNoteNode {
    note_node(
        id,
        position.x - DEFAULT_CARD_W / 2.0,
        position.y - DEFAULT_CARD_H / 2.0,
        DEFAULT_CARD_W,
        DEFAULT_CARD_H,
        text.to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn card(id: &str) -> CanvasCard {
        CanvasCard { id: id.into(), x: 10.0, y: 20.0, w: 240.0, h: 150.0, text: "hello".into() }
    }

    #[test]
    fn cards_become_note_nodes() {
        let nodes = cards_to_nodes(&[card("a")]);
        assert_eq!(nodes.len(), 1);
        let n = &nodes[0];
        assert_eq!(n.node_type, "note");
        assert_eq!((n.width, n.height), (240.0, 150.0));
        assert_eq!(n.style, FlowSize { width: 240.0, height: 150.0 });
        assert_eq!(n.data.text, "hello");
        let v = serde_json::to_value(n).unwrap();
        assert_eq!(v["type"], "note");
        assert_eq!(v["position"]["x"], 10.0);
        assert_eq!(v["style"]["width"], 240.0);
    }

    #[test]
    fn edges_become_smoothstep() {
        let flow = canvas_edges_to_flow(&[CanvasEdge { id: "e".into(), from: "a".into(), to: "b".into() }]);
        assert_eq!(flow[0].source, "a");
        assert_eq!(flow[0].target, "b");
        let v = serde_json::to_value(&flow[0]).unwrap();
        assert_eq!(v["type"], "smoothstep");
    }

    #[test]
    fn flow_roundtrips_to_document() {
        let doc = CanvasDocument {
            doc_type: "canvas".into(),
            version: 1,
            cards: vec![card("a"), card("b")],
            edges: vec![CanvasEdge { id: "e".into(), from: "a".into(), to: "b".into() }],
        };
        let nodes: Vec<FlowNode> =
            serde_json::from_value(serde_json::to_value(cards_to_nodes(&doc.cards)).unwrap()).unwrap();
        let edges: Vec<FlowEdge> =
            serde_json::from_value(serde_json::to_value(canvas_edges_to_flow(&doc.edges)).unwrap()).unwrap();
        assert_eq!(flow_to_canvas_document(&nodes, &edges), doc);
    }

    #[test]
    fn size_falls_back_and_uses_measured() {
        let nodes: Vec<FlowNode> = serde_json::from_value(json!([
            { "id": "tiny", "position": { "x": 0, "y": 0 }, "data": { "text": "t" }, "width": 10, "height": 30 },
            { "id": "measured", "position": { "x": 1, "y": 2 }, "data": {}, "measured": { "width": 300, "height": 90 },
              "selected": true },
            { "id": "bad", "position": { "x": 0, "y": 0 }, "data": { "text": 5 } }
        ]))
        .unwrap();
        let doc = flow_to_canvas_document(&nodes, &[]);
        assert_eq!((doc.cards[0].w, doc.cards[0].h), (DEFAULT_CARD_W, DEFAULT_CARD_H));
        assert_eq!((doc.cards[1].w, doc.cards[1].h), (300.0, 90.0));
        assert_eq!(doc.cards[1].text, "");
        assert_eq!(doc.cards[2].text, "");
        assert_eq!((doc.cards[2].w, doc.cards[2].h), (DEFAULT_CARD_W, DEFAULT_CARD_H));
        assert_eq!(doc.cards[0].text, "t");
    }

    #[test]
    fn drops_invalid_edges() {
        let edges: Vec<FlowEdge> = serde_json::from_value(json!([
            { "id": "ok", "source": "a", "target": "b" },
            { "id": "loop", "source": "a", "target": "a" },
            { "id": "nosrc", "target": "b" },
            { "id": "null", "source": null, "target": "b" },
            { "id": "empty", "source": "", "target": "b" }
        ]))
        .unwrap();
        let doc = flow_to_canvas_document(&[], &edges);
        assert_eq!(doc.edges.len(), 1);
        assert_eq!(doc.edges[0].id, "ok");
    }

    #[test]
    fn new_note_is_centered() {
        let n = create_note_node_with_id("n".into(), FlowPosition { x: 300.0, y: 200.0 }, "hi");
        assert_eq!((n.position.x, n.position.y), (200.0, 140.0));
        assert_eq!((n.width, n.height), (DEFAULT_CARD_W, DEFAULT_CARD_H));
        assert_eq!(n.data.text, "hi");
        let random = create_note_node(FlowPosition { x: 0.0, y: 0.0 }, "");
        assert!(!random.id.is_empty());
        assert_ne!(random.id, create_note_node(FlowPosition { x: 0.0, y: 0.0 }, "").id);
    }
}
