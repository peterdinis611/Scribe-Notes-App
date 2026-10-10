//! FTS snippet sanitization for search UI.

/// Strip FTS snippet HTML except `<mark>` / `</mark>` highlight tags.
/// Mirrors FE: `html.replace(/<(?!\/?mark>)[^>]+>/gi, '')`.
pub fn sanitize_snippet(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let bytes = html.as_bytes();
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'<' {
            let ch = html[i..].chars().next().unwrap();
            out.push(ch);
            i += ch.len_utf8();
            continue;
        }
        let Some(rel_end) = html[i..].find('>') else {
            out.push_str(&html[i..]);
            break;
        };
        let end = i + rel_end;
        let tag_lower = &lower[i..=end];
        let keep = tag_lower == "<mark>" || tag_lower == "</mark>";
        if keep {
            out.push_str(&html[i..=end]);
        }
        i = end + 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_mark_strips_others() {
        assert_eq!(
            sanitize_snippet("Hello <b>x</b> <mark>world</mark> !"),
            "Hello x <mark>world</mark> !"
        );
        assert_eq!(sanitize_snippet("<mark>a</mark><em>b</em>"), "<mark>a</mark>b");
        assert_eq!(sanitize_snippet("plain text"), "plain text");
    }
}
