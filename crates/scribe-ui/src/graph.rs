//! Link-graph density + orphan helpers (force simulation stays FE).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphDensity {
    pub sparse: bool,
    pub orphan_ratio: f64,
    pub edge_ratio: f64,
}

pub fn analyze_graph_density(seed_count: usize, edge_count: usize, orphan_count: usize) -> GraphDensity {
    let n = seed_count.max(1) as f64;
    let orphan_ratio = orphan_count as f64 / n;
    let edge_ratio = edge_count as f64 / n;
    let sparse = seed_count >= 12 && (orphan_ratio >= 0.45 || edge_ratio < 0.2);
    GraphDensity {
        sparse,
        orphan_ratio,
        edge_ratio,
    }
}

pub fn suggested_layout_size(node_count: usize, sparse: bool) -> (f64, f64) {
    let n = node_count.max(1) as f64;
    let base = if sparse { 980.0 } else { 820.0 };
    let width = (base + n * 18.0).clamp(640.0, 1600.0);
    let height = (base * 0.72 + n * 14.0).clamp(480.0, 1200.0);
    (width, height)
}

pub fn is_untitled_orphan_title(title: &str) -> bool {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return true;
    }
    let lower = trimmed.to_lowercase();
    matches!(lower.as_str(), "untitled" | "bez názvu" | "bez nazvu")
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OrphanRow {
    pub id: String,
    pub title: String,
}

pub fn partition_orphans(orphans: &[OrphanRow]) -> (Vec<OrphanRow>, Vec<OrphanRow>) {
    let mut untitled = Vec::new();
    let mut named = Vec::new();
    for orphan in orphans {
        if is_untitled_orphan_title(&orphan.title) {
            untitled.push(orphan.clone());
        } else {
            named.push(orphan.clone());
        }
    }
    (untitled, named)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn density_and_untitled() {
        let d = analyze_graph_density(20, 2, 12);
        assert!(d.sparse);
        assert!(is_untitled_orphan_title("Untitled"));
        assert!(!is_untitled_orphan_title("Notes"));
    }
}
