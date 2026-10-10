//! Heading outline for the Markdown source view (`collectMarkdownHeadingOutline`
//! in `src/lib/editor/markdown-outline.ts`). DOM scrolling (`jumpToMarkdownOutlineItem`) stays in the FE.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownOutlineItem {
    /// `md-heading-<lineIndex>`
    pub id: String,
    /// Character offset of the line start, in UTF-16 code units (JS string indices).
    pub pos: usize,
    /// Always `"heading"`.
    pub kind: String,
    pub label: String,
    pub preview: String,
    /// 0-based heading depth (`#` → 0).
    pub depth: usize,
}

/// JS `.` excludes these line terminators.
fn is_js_line_terminator(c: char) -> bool {
    matches!(c, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// Emulates `/^(#{1,6})\s+(.+)$/` on a single line; returns (hash count, heading text).
fn match_heading(line: &str) -> Option<(usize, &str)> {
    let hashes = line.chars().take_while(|c| *c == '#').count();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    let rest = &line[hashes..];
    // `\s+` followed by a non-empty `.+` that reaches end of line (no line terminators).
    let indices: Vec<usize> = rest.char_indices().map(|(i, _)| i).collect();
    for k in (1..indices.len()).rev() {
        let split = indices[k];
        let (ws, tail) = rest.split_at(split);
        if ws.chars().all(char::is_whitespace) && !tail.chars().any(is_js_line_terminator) {
            return Some((hashes, tail));
        }
    }
    None
}

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

pub fn collect_markdown_heading_outline(markdown: &str) -> Vec<MarkdownOutlineItem> {
    let mut items = Vec::new();
    let mut line_start = 0usize;

    for (line_index, line) in markdown.split('\n').enumerate() {
        let start = line_start;
        line_start += utf16_len(line) + 1;
        let Some((hashes, text)) = match_heading(line) else {
            continue;
        };
        let depth = hashes - 1;
        items.push(MarkdownOutlineItem {
            id: format!("md-heading-{line_index}"),
            pos: start,
            kind: "heading".into(),
            label: format!("Nadpis {}", depth + 1),
            preview: text.trim().to_string(),
            depth,
        });
    }
    items
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_headings_with_offsets() {
        let md = "# One\ntext\n## Two words\n###### Six";
        let out = collect_markdown_heading_outline(md);
        assert_eq!(out.len(), 3);
        assert_eq!((out[0].id.as_str(), out[0].pos, out[0].depth), ("md-heading-0", 0, 0));
        assert_eq!(out[0].label, "Nadpis 1");
        assert_eq!(out[0].preview, "One");
        assert_eq!((out[1].id.as_str(), out[1].pos, out[1].depth), ("md-heading-2", 11, 1));
        assert_eq!(out[1].preview, "Two words");
        assert_eq!(out[2].depth, 5);
        assert_eq!(&md[out[2].pos..out[2].pos + 6], "######");
    }

    #[test]
    fn rejects_non_headings() {
        for md in ["#nospace", "####### seven", " # indented", "#", "# ", "text # x", "# x\r"] {
            assert!(collect_markdown_heading_outline(md).is_empty(), "{md:?}");
        }
    }

    #[test]
    fn utf16_offsets() {
        // 😀 is 2 UTF-16 units; "é" is 1.
        let md = "é😀\n# H";
        let out = collect_markdown_heading_outline(md);
        assert_eq!(out[0].pos, 4);
    }

    #[test]
    fn trims_preview() {
        let out = collect_markdown_heading_outline("#   spaced   ");
        assert_eq!(out[0].preview, "spaced");
    }
}
