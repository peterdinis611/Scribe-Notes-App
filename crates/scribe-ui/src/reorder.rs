//! DnD list reorder + folder nest cycle checks.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

/// Move `from_id` so it sits immediately before `to_id`.
pub fn move_id_before(ids: &[String], from_id: &str, to_id: &str) -> Vec<String> {
    if from_id == to_id {
        return ids.to_vec();
    }
    let from = match ids.iter().position(|id| id == from_id) {
        Some(i) => i,
        None => return ids.to_vec(),
    };
    if !ids.iter().any(|id| id == to_id) {
        return ids.to_vec();
    }

    let mut next = ids.to_vec();
    let item = next.remove(from);
    let target = match next.iter().position(|id| id == to_id) {
        Some(i) => i,
        None => return ids.to_vec(),
    };
    next.insert(target, item);
    if next.iter().eq(ids.iter()) {
        return ids.to_vec();
    }
    next
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderNestNode {
    pub id: String,
    pub parent_id: Option<String>,
}

/// Whether `drag_id` can be nested under `target_id` without creating a cycle.
pub fn can_nest_folder(drag_id: &str, target_id: Option<&str>, folders: &[FolderNestNode]) -> bool {
    if Some(drag_id) == target_id {
        return false;
    }
    let Some(target) = target_id else {
        return true;
    };

    let mut children_by_parent: HashMap<&str, Vec<&str>> = HashMap::new();
    for folder in folders {
        if let Some(parent) = folder.parent_id.as_deref() {
            children_by_parent
                .entry(parent)
                .or_default()
                .push(folder.id.as_str());
        }
    }

    let mut seen = HashSet::from([drag_id]);
    let mut queue = VecDeque::from([drag_id]);
    while let Some(current) = queue.pop_back() {
        if current == target {
            return false;
        }
        for child in children_by_parent.get(current).into_iter().flatten() {
            if seen.insert(child) {
                queue.push_back(child);
            }
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reorders_before_target() {
        let ids = ["a", "b", "c", "d"].map(String::from);
        assert_eq!(
            move_id_before(&ids, "d", "b"),
            ["a", "d", "b", "c"].map(String::from)
        );
    }

    #[test]
    fn rejects_nesting_into_descendant() {
        let folders = vec![
            FolderNestNode {
                id: "root".into(),
                parent_id: None,
            },
            FolderNestNode {
                id: "child".into(),
                parent_id: Some("root".into()),
            },
        ];
        assert!(!can_nest_folder("root", Some("child"), &folders));
        assert!(can_nest_folder("child", Some("root"), &folders));
        assert!(can_nest_folder("child", None, &folders));
    }
}
