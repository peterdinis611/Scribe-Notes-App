//! Diff presentation filters (LCS lives in scribe-core).

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    #[serde(rename = "type")]
    pub kind: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiffChangeCounts {
    pub added: usize,
    pub removed: usize,
}

pub const CURRENT_REVISION_ID: &str = "__current__";

pub fn count_diff_changes(lines: &[DiffLine]) -> DiffChangeCounts {
    let mut added = 0;
    let mut removed = 0;
    for line in lines {
        match line.kind.as_str() {
            "added" => added += 1,
            "removed" => removed += 1,
            _ => {}
        }
    }
    DiffChangeCounts { added, removed }
}

pub fn filter_diff_lines(lines: &[DiffLine], changes_only: bool) -> Vec<DiffLine> {
    if !changes_only {
        return lines.to_vec();
    }
    lines
        .iter()
        .filter(|line| line.kind != "unchanged")
        .cloned()
        .collect()
}

pub fn filter_diff_lines_with_context(
    lines: &[DiffLine],
    changes_only: bool,
    context_lines: usize,
) -> Vec<DiffLine> {
    if !changes_only {
        return lines.to_vec();
    }
    if context_lines == 0 {
        return filter_diff_lines(lines, true);
    }
    let mut keep = HashSet::new();
    for (index, line) in lines.iter().enumerate() {
        if line.kind == "unchanged" {
            continue;
        }
        let start = index.saturating_sub(context_lines);
        let end = (index + context_lines).min(lines.len().saturating_sub(1));
        for i in start..=end {
            keep.insert(i);
        }
    }
    lines
        .iter()
        .enumerate()
        .filter(|(i, _)| keep.contains(i))
        .map(|(_, line)| line.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_and_filters() {
        let lines = vec![
            DiffLine { kind: "unchanged".into(), text: "a".into() },
            DiffLine { kind: "added".into(), text: "b".into() },
            DiffLine { kind: "removed".into(), text: "c".into() },
        ];
        let counts = count_diff_changes(&lines);
        assert_eq!(counts.added, 1);
        assert_eq!(counts.removed, 1);
        assert_eq!(filter_diff_lines(&lines, true).len(), 2);
    }
}
