//! Shared download / export filename sanitization.

pub fn sanitize_file_stem(name: &str, max_len: usize) -> String {
    let cleaned = name
        .trim()
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => ' ',
            other => other,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let truncated: String = cleaned.chars().take(max_len.max(1)).collect();
    let trimmed = truncated.trim();
    if trimmed.is_empty() {
        "scribe".into()
    } else {
        trimmed.to_string()
    }
}

pub fn sanitize_file_name(name: &str, ext: &str) -> String {
    let stem = sanitize_file_stem(name, 80);
    let ext = ext.trim().trim_start_matches('.');
    if ext.is_empty() {
        stem
    } else {
        format!("{stem}.{ext}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_illegal() {
        assert_eq!(sanitize_file_name("a/b:c", "md"), "a b c.md");
        assert_eq!(sanitize_file_name("   ", "txt"), "scribe.txt");
    }
}
