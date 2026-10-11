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

/// One cell in a side-by-side revision row (`src/lib/revisions/diff-text.ts`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideBySideCell {
    pub kind: String,
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub line_type: Option<String>,
    #[serde(default)]
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SideBySideRow {
    pub left: SideBySideCell,
    pub right: SideBySideCell,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paired: Option<bool>,
}

fn row_is_change(row: &SideBySideRow) -> bool {
    row.left.line_type.as_deref() != Some("unchanged")
        || row.right.line_type.as_deref() != Some("unchanged")
}

pub fn filter_side_by_side_rows(rows: &[SideBySideRow], changes_only: bool) -> Vec<SideBySideRow> {
    if !changes_only {
        return rows.to_vec();
    }
    rows.iter()
        .filter(|row| row_is_change(row))
        .cloned()
        .collect()
}

pub fn filter_side_by_side_with_context(
    rows: &[SideBySideRow],
    changes_only: bool,
    context_lines: usize,
) -> Vec<SideBySideRow> {
    if !changes_only {
        return rows.to_vec();
    }
    if context_lines == 0 {
        return filter_side_by_side_rows(rows, true);
    }
    let mut keep = HashSet::new();
    for (index, row) in rows.iter().enumerate() {
        if !row_is_change(row) {
            continue;
        }
        let start = index.saturating_sub(context_lines);
        let end = (index + context_lines).min(rows.len().saturating_sub(1));
        for i in start..=end {
            keep.insert(i);
        }
    }
    rows.iter()
        .enumerate()
        .filter(|(i, _)| keep.contains(i))
        .map(|(_, row)| row.clone())
        .collect()
}

/// Normalize Rust side-by-side cells (`paired: null` → omit / false).
pub fn normalize_side_by_side_rows(rows: Vec<SideBySideRow>) -> Vec<SideBySideRow> {
    rows.into_iter()
        .map(|mut row| {
            if row.paired == Some(false) {
                row.paired = None;
            }
            row
        })
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

    #[test]
    fn filters_side_by_side() {
        let rows = vec![
            SideBySideRow {
                left: SideBySideCell {
                    kind: "text".into(),
                    line_type: Some("unchanged".into()),
                    text: "a".into(),
                },
                right: SideBySideCell {
                    kind: "text".into(),
                    line_type: Some("unchanged".into()),
                    text: "a".into(),
                },
                paired: None,
            },
            SideBySideRow {
                left: SideBySideCell {
                    kind: "text".into(),
                    line_type: Some("removed".into()),
                    text: "b".into(),
                },
                right: SideBySideCell {
                    kind: "text".into(),
                    line_type: Some("added".into()),
                    text: "c".into(),
                },
                paired: Some(true),
            },
        ];
        assert_eq!(filter_side_by_side_rows(&rows, true).len(), 1);
        assert_eq!(filter_side_by_side_with_context(&rows, true, 1).len(), 2);
    }
}
