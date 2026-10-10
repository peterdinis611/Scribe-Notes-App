//! Library sidebar tree: build / flatten / row heights (`src/lib/library/tree.ts`).
//!
//! `LibraryFolder` / `LibraryDocument` keep every extra field the frontend sends
//! (`createdAt`, `isPinned`, `tags`, ...) in `extra`, so a tree round-trips losslessly.
//! A minimal `FolderNode` (see `folders.rs`) converts into `LibraryFolder` via `From`.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::folders::FolderNode;

/// Row height (px) of a folder row in the virtualized list.
pub const FOLDER_ROW_HEIGHT: u32 = 32;
/// Row height (px) of a document row in the virtualized list.
pub const DOCUMENT_ROW_HEIGHT: u32 = 52;

/// Folder as the library tree sees it; unknown fields are preserved in `extra`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFolder {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// Document summary as the library tree sees it; unknown fields are preserved in `extra`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryDocument {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub folder_id: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl From<&FolderNode> for LibraryFolder {
    fn from(node: &FolderNode) -> Self {
        Self {
            id: node.id.clone(),
            name: node.name.clone(),
            parent_id: node.parent_id.clone(),
            extra: Map::new(),
        }
    }
}

/// Nested tree node (`{ type: "folder", folder, children }` / `{ type: "document", document }`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TreeNode {
    Folder {
        folder: LibraryFolder,
        children: Vec<TreeNode>,
    },
    Document {
        document: LibraryDocument,
    },
}

/// Flat, depth-annotated row for virtualized rendering.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum FlatTreeItem {
    #[serde(rename_all = "camelCase")]
    Folder {
        folder: LibraryFolder,
        depth: usize,
        has_children: bool,
    },
    #[serde(rename_all = "camelCase")]
    Document {
        document: LibraryDocument,
        depth: usize,
    },
}

/// Nest folders under their parents and documents under their folders.
///
/// Within a parent, child folders come first (input order), then documents (input order).
/// Folders whose parent is unknown become roots; folders caught in a parent cycle are
/// unreachable from any root and are dropped (same as the frontend).
pub fn build_tree(folders: &[LibraryFolder], documents: &[LibraryDocument]) -> Vec<TreeNode> {
    let known: HashSet<&str> = folders.iter().map(|f| f.id.as_str()).collect();

    // Later duplicates of an id win, like `Map.set` in the frontend.
    let mut folder_by_id: HashMap<&str, &LibraryFolder> = HashMap::new();
    for folder in folders {
        folder_by_id.insert(folder.id.as_str(), folder);
    }

    let mut child_folders: HashMap<&str, Vec<&str>> = HashMap::new();
    let mut root_folders: Vec<&str> = Vec::new();
    let mut seen_in_order: HashSet<&str> = HashSet::new();
    for folder in folders {
        // Duplicate ids collapse to a single node (the Map entry), positioned at first occurrence.
        if !seen_in_order.insert(folder.id.as_str()) {
            continue;
        }
        let effective = folder_by_id[folder.id.as_str()];
        match effective.parent_id.as_deref() {
            Some(parent) if !parent.is_empty() && known.contains(parent) => {
                child_folders.entry(parent).or_default().push(folder.id.as_str());
            }
            _ => root_folders.push(folder.id.as_str()),
        }
    }

    let mut child_docs: HashMap<&str, Vec<&LibraryDocument>> = HashMap::new();
    let mut root_docs: Vec<&LibraryDocument> = Vec::new();
    for doc in documents {
        match doc.folder_id.as_deref() {
            Some(folder) if !folder.is_empty() && known.contains(folder) => {
                child_docs.entry(folder).or_default().push(doc);
            }
            _ => root_docs.push(doc),
        }
    }

    fn build_folder(
        id: &str,
        folder_by_id: &HashMap<&str, &LibraryFolder>,
        child_folders: &HashMap<&str, Vec<&str>>,
        child_docs: &HashMap<&str, Vec<&LibraryDocument>>,
        visited: &mut HashSet<String>,
    ) -> TreeNode {
        visited.insert(id.to_string());
        let mut children = Vec::new();
        for child in child_folders.get(id).into_iter().flatten() {
            if visited.contains(*child) {
                continue;
            }
            children.push(build_folder(child, folder_by_id, child_folders, child_docs, visited));
        }
        for doc in child_docs.get(id).into_iter().flatten() {
            children.push(TreeNode::Document { document: (*doc).clone() });
        }
        TreeNode::Folder { folder: folder_by_id[id].clone(), children }
    }

    let mut visited = HashSet::new();
    let mut roots: Vec<TreeNode> = root_folders
        .iter()
        .map(|id| build_folder(id, &folder_by_id, &child_folders, &child_docs, &mut visited))
        .collect();
    roots.extend(root_docs.into_iter().map(|doc| TreeNode::Document { document: doc.clone() }));
    roots
}

/// Depth-first flatten; folder children are emitted only when the folder id is expanded.
pub fn flatten_tree(nodes: &[TreeNode], expanded_ids: &[String]) -> Vec<FlatTreeItem> {
    let expanded: HashSet<&str> = expanded_ids.iter().map(String::as_str).collect();
    let mut items = Vec::new();
    flatten_into(nodes, &expanded, 0, &mut items);
    items
}

fn flatten_into(
    nodes: &[TreeNode],
    expanded: &HashSet<&str>,
    depth: usize,
    items: &mut Vec<FlatTreeItem>,
) {
    for node in nodes {
        match node {
            TreeNode::Folder { folder, children } => {
                let has_children = !children.is_empty();
                items.push(FlatTreeItem::Folder { folder: folder.clone(), depth, has_children });
                if has_children && expanded.contains(folder.id.as_str()) {
                    flatten_into(children, expanded, depth + 1, items);
                }
            }
            TreeNode::Document { document } => {
                items.push(FlatTreeItem::Document { document: document.clone(), depth });
            }
        }
    }
}

/// `build_tree` + `flatten_tree` in one call.
pub fn flatten_library(
    folders: &[LibraryFolder],
    documents: &[LibraryDocument],
    expanded_ids: &[String],
) -> Vec<FlatTreeItem> {
    flatten_tree(&build_tree(folders, documents), expanded_ids)
}

/// Estimated row height (px) for a virtualized list.
pub fn estimate_flat_item_size(item: &FlatTreeItem) -> u32 {
    match item {
        FlatTreeItem::Folder { .. } => FOLDER_ROW_HEIGHT,
        FlatTreeItem::Document { .. } => DOCUMENT_ROW_HEIGHT,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn folder(id: &str, parent: Option<&str>) -> LibraryFolder {
        LibraryFolder {
            id: id.into(),
            name: id.to_uppercase(),
            parent_id: parent.map(Into::into),
            extra: Map::new(),
        }
    }

    fn doc(id: &str, folder: Option<&str>) -> LibraryDocument {
        LibraryDocument {
            id: id.into(),
            title: id.into(),
            folder_id: folder.map(Into::into),
            extra: Map::new(),
        }
    }

    #[test]
    fn nests_folders_then_documents() {
        let folders = vec![folder("a", None), folder("b", Some("a")), folder("c", Some("missing"))];
        let docs = vec![doc("d1", Some("a")), doc("d2", None), doc("d3", Some("ghost"))];
        let tree = build_tree(&folders, &docs);
        assert_eq!(tree.len(), 4); // a, c, d2, d3
        match &tree[0] {
            TreeNode::Folder { folder, children } => {
                assert_eq!(folder.id, "a");
                assert_eq!(children.len(), 2);
                assert!(matches!(&children[0], TreeNode::Folder { folder, .. } if folder.id == "b"));
                assert!(matches!(&children[1], TreeNode::Document { document } if document.id == "d1"));
            }
            other => panic!("unexpected {other:?}"),
        }
        assert!(matches!(&tree[1], TreeNode::Folder { folder, .. } if folder.id == "c"));
        assert!(matches!(&tree[2], TreeNode::Document { document } if document.id == "d2"));
        assert!(matches!(&tree[3], TreeNode::Document { document } if document.id == "d3"));
    }

    #[test]
    fn parent_cycles_are_dropped_without_hanging() {
        let folders = vec![folder("a", Some("b")), folder("b", Some("a")), folder("s", Some("s"))];
        assert!(build_tree(&folders, &[]).is_empty());
    }

    #[test]
    fn flatten_respects_expansion_and_depth() {
        let folders = vec![folder("a", None), folder("b", Some("a")), folder("e", None)];
        let docs = vec![doc("d", Some("b"))];
        let tree = build_tree(&folders, &docs);

        let collapsed = flatten_tree(&tree, &[]);
        assert_eq!(collapsed.len(), 2);
        assert!(matches!(&collapsed[0], FlatTreeItem::Folder { depth: 0, has_children: true, .. }));
        assert!(matches!(&collapsed[1], FlatTreeItem::Folder { depth: 0, has_children: false, .. }));

        let expanded = flatten_tree(&tree, &["a".to_string()]);
        assert_eq!(expanded.len(), 3);
        assert!(matches!(&expanded[1], FlatTreeItem::Folder { depth: 1, has_children: true, .. }));

        let all = flatten_tree(&tree, &["a".to_string(), "b".to_string()]);
        assert_eq!(all.len(), 4);
        assert!(matches!(&all[2], FlatTreeItem::Document { depth: 2, .. }));
    }

    #[test]
    fn row_heights() {
        let items = flatten_library(&[folder("a", None)], &[doc("d", None)], &[]);
        assert_eq!(estimate_flat_item_size(&items[0]), 32);
        assert_eq!(estimate_flat_item_size(&items[1]), 52);
    }

    #[test]
    fn serde_shape_and_extra_roundtrip() {
        let raw = json!({
            "id": "f1", "name": "F", "parentId": null, "createdAt": 5, "isPinned": true
        });
        let f: LibraryFolder = serde_json::from_value(raw.clone()).unwrap();
        assert_eq!(f.extra.get("isPinned"), Some(&json!(true)));
        assert_eq!(serde_json::to_value(&f).unwrap(), raw);

        let d: LibraryDocument = serde_json::from_value(json!({
            "id": "d1", "title": "T", "folderId": "f1", "tags": ["x"]
        }))
        .unwrap();
        let items = flatten_library(&[f], &[d], &["f1".to_string()]);
        let v = serde_json::to_value(&items).unwrap();
        assert_eq!(v[0]["type"], "folder");
        assert_eq!(v[0]["hasChildren"], true);
        assert_eq!(v[0]["depth"], 0);
        assert_eq!(v[1]["type"], "document");
        assert_eq!(v[1]["document"]["tags"], json!(["x"]));
        assert_eq!(v[1]["depth"], 1);

        let tree = build_tree(&[], &[]);
        assert!(tree.is_empty());
    }

    #[test]
    fn tree_node_serde() {
        let tree = build_tree(&[folder("a", None)], &[doc("d", Some("a"))]);
        let v = serde_json::to_value(&tree).unwrap();
        assert_eq!(v[0]["type"], "folder");
        assert_eq!(v[0]["children"][0]["type"], "document");
        let back: Vec<TreeNode> = serde_json::from_value(v).unwrap();
        assert_eq!(back, tree);
    }

    #[test]
    fn from_folder_node() {
        let node = FolderNode { id: "x".into(), name: "X".into(), parent_id: Some("y".into()) };
        let f = LibraryFolder::from(&node);
        assert_eq!(f.parent_id.as_deref(), Some("y"));
    }
}
