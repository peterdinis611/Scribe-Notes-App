//! Line based diff with the same semantics as `src/lib/revisions/diff-text.ts`:
//! split on `\n`, build an LCS matrix, backtrack from the bottom right corner.

use serde::{Deserialize, Serialize};

/// Largest LCS matrix we are willing to allocate (cells, 4 bytes each).
const MAX_MATRIX_CELLS: usize = 16_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiffLineType {
    Unchanged,
    Added,
    Removed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffLine {
    #[serde(rename = "type")]
    pub line_type: DiffLineType,
    pub text: String,
}

impl DiffLine {
    fn new(line_type: DiffLineType, text: &str) -> Self {
        Self {
            line_type,
            text: text.to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffResult {
    pub lines: Vec<DiffLine>,
    pub added: usize,
    pub removed: usize,
}

pub fn diff_lines(old_text: &str, new_text: &str) -> DiffResult {
    let old_lines: Vec<&str> = old_text.split('\n').collect();
    let new_lines: Vec<&str> = new_text.split('\n').collect();
    let lines = diff_slices(&old_lines, &new_lines);

    let added = lines
        .iter()
        .filter(|line| line.line_type == DiffLineType::Added)
        .count();
    let removed = lines
        .iter()
        .filter(|line| line.line_type == DiffLineType::Removed)
        .count();

    DiffResult {
        lines,
        added,
        removed,
    }
}

fn diff_slices(old_lines: &[&str], new_lines: &[&str]) -> Vec<DiffLine> {
    if matrix_fits(old_lines.len(), new_lines.len()) {
        return backtrack(old_lines, new_lines, &lcs_matrix(old_lines, new_lines));
    }

    // Oversized input: peel the identical head and tail so that mostly unchanged
    // revisions still produce a useful diff without allocating a huge matrix.
    let prefix = old_lines
        .iter()
        .zip(new_lines.iter())
        .take_while(|(old, new)| old == new)
        .count();
    let remaining = old_lines.len().min(new_lines.len()) - prefix;
    let suffix = old_lines
        .iter()
        .rev()
        .zip(new_lines.iter().rev())
        .take(remaining)
        .take_while(|(old, new)| old == new)
        .count();

    let old_mid = &old_lines[prefix..old_lines.len() - suffix];
    let new_mid = &new_lines[prefix..new_lines.len() - suffix];

    let mut lines: Vec<DiffLine> = old_lines[..prefix]
        .iter()
        .map(|text| DiffLine::new(DiffLineType::Unchanged, text))
        .collect();

    if matrix_fits(old_mid.len(), new_mid.len()) {
        lines.extend(backtrack(old_mid, new_mid, &lcs_matrix(old_mid, new_mid)));
    } else {
        lines.extend(
            old_mid
                .iter()
                .map(|text| DiffLine::new(DiffLineType::Removed, text)),
        );
        lines.extend(
            new_mid
                .iter()
                .map(|text| DiffLine::new(DiffLineType::Added, text)),
        );
    }

    lines.extend(
        old_lines[old_lines.len() - suffix..]
            .iter()
            .map(|text| DiffLine::new(DiffLineType::Unchanged, text)),
    );
    lines
}

fn matrix_fits(old_len: usize, new_len: usize) -> bool {
    (old_len + 1)
        .checked_mul(new_len + 1)
        .is_some_and(|cells| cells <= MAX_MATRIX_CELLS)
}

/// Flat `(old_len + 1) x (new_len + 1)` LCS length matrix.
fn lcs_matrix(old_lines: &[&str], new_lines: &[&str]) -> Vec<u32> {
    let cols = new_lines.len() + 1;
    let mut matrix = vec![0u32; (old_lines.len() + 1) * cols];

    for i in 1..=old_lines.len() {
        for j in 1..=new_lines.len() {
            matrix[i * cols + j] = if old_lines[i - 1] == new_lines[j - 1] {
                matrix[(i - 1) * cols + (j - 1)] + 1
            } else {
                matrix[(i - 1) * cols + j].max(matrix[i * cols + (j - 1)])
            };
        }
    }

    matrix
}

fn backtrack(old_lines: &[&str], new_lines: &[&str], matrix: &[u32]) -> Vec<DiffLine> {
    let cols = new_lines.len() + 1;
    let mut lines = Vec::new();
    let mut i = old_lines.len();
    let mut j = new_lines.len();

    while i > 0 || j > 0 {
        if i > 0 && j > 0 && old_lines[i - 1] == new_lines[j - 1] {
            lines.push(DiffLine::new(DiffLineType::Unchanged, old_lines[i - 1]));
            i -= 1;
            j -= 1;
            continue;
        }

        if j > 0 && (i == 0 || matrix[i * cols + (j - 1)] >= matrix[(i - 1) * cols + j]) {
            lines.push(DiffLine::new(DiffLineType::Added, new_lines[j - 1]));
            j -= 1;
            continue;
        }

        if i > 0 {
            lines.push(DiffLine::new(DiffLineType::Removed, old_lines[i - 1]));
            i -= 1;
        }
    }

    lines.reverse();
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shape(result: &DiffResult) -> Vec<(DiffLineType, &str)> {
        result
            .lines
            .iter()
            .map(|line| (line.line_type, line.text.as_str()))
            .collect()
    }

    #[test]
    fn identical_text_has_no_changes() {
        let result = diff_lines("alpha\nbeta", "alpha\nbeta");
        assert_eq!(result.added, 0);
        assert_eq!(result.removed, 0);
        assert_eq!(
            shape(&result),
            vec![
                (DiffLineType::Unchanged, "alpha"),
                (DiffLineType::Unchanged, "beta"),
            ]
        );
    }

    #[test]
    fn inserted_line_is_added() {
        let result = diff_lines("alpha\ngamma", "alpha\nbeta\ngamma");
        assert_eq!((result.added, result.removed), (1, 0));
        assert_eq!(
            shape(&result),
            vec![
                (DiffLineType::Unchanged, "alpha"),
                (DiffLineType::Added, "beta"),
                (DiffLineType::Unchanged, "gamma"),
            ]
        );
    }

    #[test]
    fn replaced_line_is_removed_then_added() {
        let result = diff_lines("alpha\nbeta\ngamma", "alpha\ndelta\ngamma");
        assert_eq!((result.added, result.removed), (1, 1));
        assert_eq!(
            shape(&result),
            vec![
                (DiffLineType::Unchanged, "alpha"),
                (DiffLineType::Removed, "beta"),
                (DiffLineType::Added, "delta"),
                (DiffLineType::Unchanged, "gamma"),
            ]
        );
    }

    #[test]
    fn empty_old_text_adds_every_line() {
        let result = diff_lines("", "alpha\nbeta");
        // `"".split('\n')` yields one empty line, matching the TypeScript version.
        assert_eq!(
            shape(&result),
            vec![
                (DiffLineType::Removed, ""),
                (DiffLineType::Added, "alpha"),
                (DiffLineType::Added, "beta"),
            ]
        );
        assert_eq!((result.added, result.removed), (2, 1));
    }

    #[test]
    fn deleted_lines_are_removed() {
        let result = diff_lines("alpha\nbeta\ngamma", "alpha");
        assert_eq!((result.added, result.removed), (0, 2));
        assert_eq!(
            shape(&result),
            vec![
                (DiffLineType::Unchanged, "alpha"),
                (DiffLineType::Removed, "beta"),
                (DiffLineType::Removed, "gamma"),
            ]
        );
    }

    #[test]
    fn line_type_serializes_to_lowercase_tag() {
        let json = serde_json::to_string(&DiffLine::new(DiffLineType::Added, "x")).unwrap();
        assert_eq!(json, r#"{"type":"added","text":"x"}"#);
    }

    #[test]
    fn oversized_input_falls_back_without_panicking() {
        let shared: String = (0..6000)
            .map(|index| format!("line {index}\n"))
            .collect::<String>();
        let old_text = format!("{shared}tail-old");
        let new_text = format!("{shared}tail-new");
        let result = diff_lines(&old_text, &new_text);
        assert_eq!((result.added, result.removed), (1, 1));
        assert_eq!(result.lines.len(), 6002);
    }
}
