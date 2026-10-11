//! Canvas ↔ React Flow conversion (`src/lib/canvas/flow.ts`).
//!
//! Document types live in `canvas_doc`; this module only models the React Flow node / edge
//! shapes the frontend exchanges (`@xyflow/react` `Node` / `Edge`).

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

use crate::canvas_doc::{
    card_to_object, object_to_card, CanvasCard, CanvasDocument, CanvasEdge, CanvasObject,
    CanvasObjectKind, CANVAS_CONTENT_TYPE, CANVAS_VERSION, DEFAULT_CARD_H, DEFAULT_CARD_W,
};

pub const CANVAS_NOTE_TYPE: &str = "note";
pub const CANVAS_EDGE_TYPE: &str = "smoothstep";
/// A node dimension must be strictly larger than this to be kept.
const MIN_NODE_SIZE: f64 = 24.0;

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasObjectData {
    pub kind: CanvasObjectKind,
    pub text: String,
    pub label: String,
    pub fill: String,
    pub stroke: String,
    #[serde(serialize_with = "crate::canvas_doc::ser_num", default)]
    pub stroke_width: f64,
    #[serde(serialize_with = "crate::canvas_doc::ser_num", default)]
    pub font_size: f64,
    pub color: String,
    #[serde(serialize_with = "crate::canvas_doc::ser_num", default)]
    pub z_index: f64,
    #[serde(default = "default_opacity", serialize_with = "crate::canvas_doc::ser_num")]
    pub opacity: f64,
    #[serde(default, serialize_with = "crate::canvas_doc::ser_num")]
    pub corner_radius: f64,
    #[serde(default, serialize_with = "crate::canvas_doc::ser_num")]
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

/// Back-compat alias used by older call sites.
pub type CanvasNoteData = CanvasObjectData;

/// Node produced for the canvas.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CanvasFlowNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub position: FlowPosition,
    pub data: CanvasObjectData,
    pub width: f64,
    pub height: f64,
    pub style: FlowSize,
    #[serde(default, rename = "zIndex", skip_serializing_if = "Option::is_none")]
    pub z_index: Option<f64>,
}

/// Back-compat alias.
pub type CanvasNoteNode = CanvasFlowNode;

/// Node as received from React Flow: only what `flowToCanvasDocument` reads.
#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct FlowNode {
    pub id: String,
    pub position: FlowPosition,
    #[serde(default, rename = "type")]
    pub node_type: Option<String>,
    #[serde(default)]
    pub data: Value,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub height: Option<f64>,
    #[serde(default)]
    pub measured: Option<FlowMeasured>,
    #[serde(default, rename = "zIndex")]
    pub z_index: Option<f64>,
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

fn object_to_node(object: &CanvasObject) -> CanvasFlowNode {
    CanvasFlowNode {
        id: object.id.clone(),
        node_type: object.kind.as_str().to_string(),
        position: FlowPosition {
            x: object.x,
            y: object.y,
        },
        data: CanvasObjectData {
            kind: object.kind,
            text: object.text.clone(),
            label: object.label.clone(),
            fill: object.fill.clone(),
            stroke: object.stroke.clone(),
            stroke_width: object.stroke_width,
            font_size: object.font_size,
            color: object.color.clone(),
            z_index: object.z_index,
            opacity: object.opacity,
            corner_radius: object.corner_radius,
            rotation: object.rotation,
            group_id: object.group_id.clone(),
            document_id: object.document_id.clone(),
            document_title: object.document_title.clone(),
        },
        width: object.w,
        height: object.h,
        style: FlowSize {
            width: object.w,
            height: object.h,
        },
        z_index: Some(object.z_index),
    }
}

pub fn objects_to_nodes(objects: &[CanvasObject]) -> Vec<CanvasFlowNode> {
    let mut sorted: Vec<&CanvasObject> = objects.iter().collect();
    sorted.sort_by(|a, b| a.z_index.partial_cmp(&b.z_index).unwrap_or(std::cmp::Ordering::Equal));
    sorted.into_iter().map(object_to_node).collect()
}

pub fn cards_to_nodes(cards: &[CanvasCard]) -> Vec<CanvasFlowNode> {
    let objects: Vec<CanvasObject> = cards
        .iter()
        .enumerate()
        .map(|(i, card)| card_to_object(card, i as f64))
        .collect();
    objects_to_nodes(&objects)
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

/// `width ?? measured.width ?? DEFAULT`, falling back to the default when not finite / ≤ min.
fn node_size(node: &FlowNode, default_w: f64, default_h: f64) -> (f64, f64) {
    let width = node.width.or(node.measured.and_then(|m| m.width)).unwrap_or(default_w);
    let height = node.height.or(node.measured.and_then(|m| m.height)).unwrap_or(default_h);
    (
        if width.is_finite() && width > MIN_NODE_SIZE {
            width
        } else {
            default_w
        },
        if height.is_finite() && height > MIN_NODE_SIZE {
            height
        } else {
            default_h
        },
    )
}

fn kind_from_node(node: &FlowNode) -> CanvasObjectKind {
    if let Some(kind) = node.data.get("kind").and_then(Value::as_str) {
        return CanvasObjectKind::parse(Some(kind));
    }
    CanvasObjectKind::parse(node.node_type.as_deref())
}

fn data_str(data: &Value, key: &str, fallback: &str) -> String {
    data.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn data_num(data: &Value, key: &str, fallback: f64) -> f64 {
    data.get(key).and_then(Value::as_f64).filter(|n| n.is_finite()).unwrap_or(fallback)
}

/// React Flow nodes + edges → canvas document (self-loops and dangling edges dropped).
pub fn flow_to_canvas_document(nodes: &[FlowNode], edges: &[FlowEdge]) -> CanvasDocument {
    let objects: Vec<CanvasObject> = nodes
        .iter()
        .enumerate()
        .map(|(index, node)| {
            let kind = kind_from_node(node);
            let (w, h) = node_size(node, DEFAULT_CARD_W, DEFAULT_CARD_H);
            CanvasObject {
                id: node.id.clone(),
                kind,
                x: node.position.x,
                y: node.position.y,
                w,
                h,
                z_index: data_num(&node.data, "zIndex", node.z_index.unwrap_or(index as f64)),
                text: data_str(&node.data, "text", ""),
                label: data_str(&node.data, "label", ""),
                fill: data_str(&node.data, "fill", "var(--color-surface-elevated)"),
                stroke: data_str(&node.data, "stroke", "var(--color-border)"),
                stroke_width: data_num(&node.data, "strokeWidth", 1.0),
                font_size: data_num(&node.data, "fontSize", 14.0),
                color: data_str(&node.data, "color", "var(--color-foreground)"),
                opacity: data_num(&node.data, "opacity", 1.0).clamp(0.0, 1.0),
                corner_radius: data_num(&node.data, "cornerRadius", 0.0),
                rotation: data_num(&node.data, "rotation", 0.0),
                group_id: data_str(&node.data, "groupId", ""),
                document_id: data_str(&node.data, "documentId", ""),
                document_title: data_str(&node.data, "documentTitle", ""),
            }
        })
        .collect();
    let cards = objects.iter().filter_map(object_to_card).collect();
    CanvasDocument {
        doc_type: CANVAS_CONTENT_TYPE.to_string(),
        version: CANVAS_VERSION,
        cards,
        objects,
        edges: edges
            .iter()
            .filter(|e| !e.source.is_empty() && !e.target.is_empty() && e.source != e.target)
            .map(|e| CanvasEdge {
                id: e.id.clone(),
                from: e.source.clone(),
                to: e.target.clone(),
            })
            .collect(),
        viewport: None,
    }
}

/// New note centered on `position` with a fresh UUID.
pub fn create_note_node(position: FlowPosition, text: &str) -> CanvasFlowNode {
    create_note_node_with_id(uuid::Uuid::new_v4().to_string(), position, text)
}

/// Deterministic variant of [`create_note_node`] (caller supplies the id).
pub fn create_note_node_with_id(id: String, position: FlowPosition, text: &str) -> CanvasFlowNode {
    let mut object = card_to_object(
        &CanvasCard {
            id,
            x: position.x - DEFAULT_CARD_W / 2.0,
            y: position.y - DEFAULT_CARD_H / 2.0,
            w: DEFAULT_CARD_W,
            h: DEFAULT_CARD_H,
            text: text.to_string(),
        },
        0.0,
    );
    object.x = position.x - DEFAULT_CARD_W / 2.0;
    object.y = position.y - DEFAULT_CARD_H / 2.0;
    object_to_node(&object)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn card(id: &str) -> CanvasCard {
        CanvasCard {
            id: id.into(),
            x: 10.0,
            y: 20.0,
            w: 240.0,
            h: 150.0,
            text: "hello".into(),
        }
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
        let flow = canvas_edges_to_flow(&[CanvasEdge {
            id: "e".into(),
            from: "a".into(),
            to: "b".into(),
        }]);
        assert_eq!(flow[0].source, "a");
        assert_eq!(flow[0].target, "b");
        let v = serde_json::to_value(&flow[0]).unwrap();
        assert_eq!(v["type"], "smoothstep");
    }

    #[test]
    fn flow_roundtrips_to_document() {
        let objects = vec![card_to_object(&card("a"), 0.0), card_to_object(&card("b"), 1.0)];
        let doc = CanvasDocument {
            doc_type: "canvas".into(),
            version: 2,
            cards: objects.iter().filter_map(object_to_card).collect(),
            objects: objects.clone(),
            edges: vec![CanvasEdge {
                id: "e".into(),
                from: "a".into(),
                to: "b".into(),
            }],
            viewport: None,
        };
        let nodes: Vec<FlowNode> =
            serde_json::from_value(serde_json::to_value(objects_to_nodes(&doc.objects)).unwrap())
                .unwrap();
        let edges: Vec<FlowEdge> =
            serde_json::from_value(serde_json::to_value(canvas_edges_to_flow(&doc.edges)).unwrap())
                .unwrap();
        let again = flow_to_canvas_document(&nodes, &edges);
        assert_eq!(again.cards.len(), 2);
        assert_eq!(again.objects.len(), 2);
        assert_eq!(again.edges, doc.edges);
    }

    #[test]
    fn size_falls_back_and_uses_measured() {
        let nodes: Vec<FlowNode> = serde_json::from_value(json!([
            { "id": "tiny", "position": { "x": 0, "y": 0 }, "data": { "text": "t" }, "width": 10, "height": 20 },
            { "id": "measured", "position": { "x": 1, "y": 2 }, "data": {}, "measured": { "width": 300, "height": 90 },
              "selected": true },
            { "id": "bad", "position": { "x": 0, "y": 0 }, "data": { "text": 5 } }
        ]))
        .unwrap();
        let doc = flow_to_canvas_document(&nodes, &[]);
        assert_eq!((doc.objects[0].w, doc.objects[0].h), (DEFAULT_CARD_W, DEFAULT_CARD_H));
        assert_eq!((doc.objects[1].w, doc.objects[1].h), (300.0, 90.0));
        assert_eq!(doc.objects[1].text, "");
        assert_eq!(doc.objects[2].text, "");
        assert_eq!((doc.objects[2].w, doc.objects[2].h), (DEFAULT_CARD_W, DEFAULT_CARD_H));
        assert_eq!(doc.objects[0].text, "t");
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
        assert_ne!(
            random.id,
            create_note_node(FlowPosition { x: 0.0, y: 0.0 }, "").id
        );
    }
}
