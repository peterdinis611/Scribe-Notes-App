//! Folder tree helpers for pickers (not the React sidebar UI).

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderNode {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderPickerItem {
    pub folder: FolderNode,
    pub depth: usize,
}

pub fn flatten_folders_for_picker(folders: &[FolderNode]) -> Vec<FolderPickerItem> {
    let mut children: HashMap<Option<String>, Vec<FolderNode>> = HashMap::new();
    for folder in folders {
        children
            .entry(folder.parent_id.clone())
            .or_default()
            .push(folder.clone());
    }
    for siblings in children.values_mut() {
        siblings.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    }

    let mut items = Vec::new();
    fn walk(
        parent: Option<String>,
        depth: usize,
        children: &HashMap<Option<String>, Vec<FolderNode>>,
        items: &mut Vec<FolderPickerItem>,
    ) {
        for folder in children.get(&parent).into_iter().flatten() {
            items.push(FolderPickerItem {
                folder: folder.clone(),
                depth,
            });
            walk(Some(folder.id.clone()), depth + 1, children, items);
        }
    }
    walk(None, 0, &children, &mut items);
    items
}

pub fn folder_path_label(folders: &[FolderNode], folder_id: Option<&str>, root_label: &str) -> String {
    let Some(id) = folder_id else {
        return root_label.to_string();
    };
    let by_id: HashMap<&str, &FolderNode> = folders.iter().map(|f| (f.id.as_str(), f)).collect();
    let mut parts = Vec::new();
    let mut current = by_id.get(id).copied();
    while let Some(folder) = current {
        parts.push(folder.name.clone());
        current = folder
            .parent_id
            .as_deref()
            .and_then(|pid| by_id.get(pid).copied());
    }
    parts.reverse();
    if parts.is_empty() {
        root_label.to_string()
    } else {
        parts.join(" / ")
    }
}

fn normalize_tag(value: &str) -> String {
    value.trim().to_lowercase()
}

/// Suggest a folder by matching tag/suggestion terms to folder names
/// (`src/lib/library/auto-organize.ts` offline fallback).
pub fn suggest_folder_from_tags<'a>(
    folders: &'a [FolderNode],
    terms: &[String],
) -> Option<&'a FolderNode> {
    let needles: Vec<String> = terms
        .iter()
        .map(|t| normalize_tag(t))
        .filter(|t| !t.is_empty())
        .collect();
    if needles.is_empty() {
        return None;
    }

    let mut best: Option<(&FolderNode, i32)> = None;
    for folder in folders {
        let name = normalize_tag(&folder.name);
        if name.is_empty() {
            continue;
        }
        let mut score = 0;
        for needle in &needles {
            if name == *needle {
                score += 3;
            } else if name.contains(needle) || needle.contains(&name) {
                score += 1;
            }
        }
        if score > 0 && best.as_ref().map(|(_, s)| score > *s).unwrap_or(true) {
            best = Some((folder, score));
        }
    }
    best.map(|(folder, _)| folder)
}

pub fn collect_folder_subtree_ids(folders: &[FolderNode], root_id: &str) -> Vec<String> {
    let mut children: HashMap<&str, Vec<&str>> = HashMap::new();
    for folder in folders {
        if let Some(parent) = folder.parent_id.as_deref() {
            children.entry(parent).or_default().push(folder.id.as_str());
        }
    }
    let mut ids = HashSet::from([root_id.to_string()]);
    let mut queue = VecDeque::from([root_id.to_string()]);
    while let Some(current) = queue.pop_back() {
        for child in children.get(current.as_str()).into_iter().flatten() {
            if ids.insert((*child).to_string()) {
                queue.push_back((*child).to_string());
            }
        }
    }
    ids.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flattens_and_paths() {
        let folders = vec![
            FolderNode { id: "a".into(), name: "A".into(), parent_id: None },
            FolderNode { id: "b".into(), name: "B".into(), parent_id: Some("a".into()) },
        ];
        let flat = flatten_folders_for_picker(&folders);
        assert_eq!(flat.len(), 2);
        assert_eq!(flat[1].depth, 1);
        assert_eq!(folder_path_label(&folders, Some("b"), "Root"), "A / B");
    }

    #[test]
    fn suggests_folder_from_tags() {
        let folders = vec![
            FolderNode {
                id: "work".into(),
                name: "Work".into(),
                parent_id: None,
            },
            FolderNode {
                id: "personal".into(),
                name: "Personal".into(),
                parent_id: None,
            },
        ];
        let terms = vec!["work".into(), "meeting".into()];
        let hit = suggest_folder_from_tags(&folders, &terms).unwrap();
        assert_eq!(hit.id, "work");
    }
}
