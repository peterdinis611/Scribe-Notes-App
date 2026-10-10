//! Import path helpers (`src/lib/import/import-path.ts`).

/// File stem of the last path segment (`/` or `\` separated), or `fallback` when empty.
pub fn import_title_from_path(path: &str, fallback: &str) -> String {
    let file_name = path.rsplit(['/', '\\']).next().unwrap_or(fallback);
    // JS: replace(/\.[^.]+$/, '') — strip last dot + at least one non-dot char to end.
    let stem = match file_name.rfind('.') {
        Some(i) if i + 1 < file_name.len() => &file_name[..i],
        _ => file_name,
    };
    let stem = stem.trim();
    if stem.is_empty() { fallback.to_string() } else { stem.to_string() }
}

/// True for `*.pages` or `*.pages/` (case-insensitive) paths.
pub fn is_pages_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".pages") || lower.ends_with(".pages/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles() {
        assert_eq!(import_title_from_path("/a/b/Notes.md", "x"), "Notes");
        assert_eq!(import_title_from_path("C:\\docs\\My File.docx", "x"), "My File");
        assert_eq!(import_title_from_path("archive.tar.gz", "x"), "archive.tar");
        assert_eq!(import_title_from_path("noext", "x"), "noext");
        assert_eq!(import_title_from_path(".hidden", "Untitled"), "Untitled");
        assert_eq!(import_title_from_path("/a/b/", "Untitled"), "Untitled");
        assert_eq!(import_title_from_path("  .md", "F"), "F");
    }

    #[test]
    fn pages_paths() {
        assert!(is_pages_path("/x/Doc.pages"));
        assert!(is_pages_path("/x/Doc.PAGES/"));
        assert!(!is_pages_path("/x/Doc.pages/Index"));
        assert!(!is_pages_path("/x/Doc.md"));
    }
}
