//! Normalize messy clipboard / Word / Pages / web HTML into TipTap-friendly markup.

use regex::Regex;
use serde::Serialize;
use std::sync::OnceLock;

const MAX_INPUT_CHARS: usize = 500_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HtmlPasteResult {
    pub html: String,
    pub changed: bool,
    pub source: String,
    pub stripped_tags: usize,
}

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).expect("html paste regex")
}

fn re_conditional() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"(?is)<!--\[if[\s\S]*?<!\[endif\]-->"))
}
fn re_comments() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"(?s)<!--.*?-->"))
}
fn re_script_style() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        re(r"(?is)<(?:script|style|meta|link|xml|head|title)\b[^>]*>[\s\S]*?</(?:script|style|meta|link|xml|head|title)\s*>")
    })
}
fn re_void_junk() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"(?is)</?(script|style|meta|link|xml|head|title|o:[a-z]+|w:[a-z]+)[^>]*/?>"))
}
fn re_namespace() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"(?i)</?(o|w|v|m):[^>]*>"))
}
fn re_span_open() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"(?is)<span\b[^>]*>"))
}
fn re_span_close() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"(?i)</span>"))
}
fn re_font() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"(?is)</?font\b[^>]*>"))
}
fn re_attrs() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        re(r#"(?i)\s(?:style|class|id|lang|dir|width|height|align|valign|bgcolor|border|cellpadding|cellspacing|face|color|size|data-[a-z0-9_-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)"#)
    })
}
fn re_empty_p() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"(?is)<p(?:\s[^>]*)?>\s*(?:&nbsp;|\u{00a0}|\s|<br\s*/?>)*\s*</p>"))
}
fn re_nbsp() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"&nbsp;|&#160;|\u{00a0}"))
}
fn re_b() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"(?i)</?b\b[^>]*>"))
}
fn re_i() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"(?i)</?i\b[^>]*>"))
}
fn re_div_open() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"(?is)<div\b[^>]*>"))
}
fn re_div_close() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"(?i)</div>"))
}
fn re_allowed_open() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        re(r"(?is)</?(?:p|h[1-6]|ul|ol|li|a|strong|em|code|pre|blockquote|table|thead|tbody|tr|th|td|br|hr|img|sup|sub)\b[^>]*>")
    })
}
fn re_any_tag() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"(?is)</?[a-z][^>]*>"))
}
fn re_multi_br() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"(?i)(?:<br\s*/?>\s*){3,}"))
}
fn re_whitespace() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r"[ \t]{2,}"))
}
fn re_href() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r#"(?is)<a\b([^>]*)>"#))
}
fn re_img() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| re(r#"(?is)<img\b([^>]*)/?>"#))
}
fn re_attr_value(name: &str) -> Regex {
    re(&format!(
        r#"(?i)\b{name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#
    ))
}

/// Detect Word / Office / Google Docs / Pages clipboard noise.
pub fn looks_like_dirty_html(html: &str) -> bool {
    let lower = html.to_ascii_lowercase();
    lower.contains("mso-")
        || lower.contains("xmlns:o")
        || lower.contains("xmlns:w")
        || lower.contains("urn:schemas-microsoft")
        || lower.contains("docs-internal-guid")
        || lower.contains("apple-converted-space")
        || lower.contains("<o:p")
        || lower.contains("class=\"msonormal")
        || (lower.contains("<span") && lower.contains("style="))
        || lower.contains("<font ")
}

/// Clean clipboard HTML into a TipTap-friendly subset.
pub fn normalize_clipboard_html(html: &str) -> HtmlPasteResult {
    let original = if html.chars().count() > MAX_INPUT_CHARS {
        html.chars().take(MAX_INPUT_CHARS).collect::<String>()
    } else {
        html.to_string()
    };

    if original.trim().is_empty() {
        return HtmlPasteResult {
            html: String::new(),
            changed: false,
            source: "rust".into(),
            stripped_tags: 0,
        };
    }

    let before_tags = count_tags(&original);
    let mut out = original.clone();

    out = re_conditional().replace_all(&out, "").into_owned();
    out = re_comments().replace_all(&out, "").into_owned();
    out = re_script_style().replace_all(&out, "").into_owned();
    out = re_void_junk().replace_all(&out, "").into_owned();
    out = re_namespace().replace_all(&out, "").into_owned();

    out = rewrite_anchors(&out);
    out = rewrite_images(&out);

    out = re_span_open().replace_all(&out, "").into_owned();
    out = re_span_close().replace_all(&out, "").into_owned();
    out = re_font().replace_all(&out, "").into_owned();
    out = re_attrs().replace_all(&out, "").into_owned();

    out = re_b()
        .replace_all(&out, |caps: &regex::Captures| -> String {
            if caps
                .get(0)
                .map(|m| m.as_str().starts_with("</"))
                .unwrap_or(false)
            {
                "</strong>".to_string()
            } else {
                "<strong>".to_string()
            }
        })
        .into_owned();
    out = re_i()
        .replace_all(&out, |caps: &regex::Captures| -> String {
            if caps
                .get(0)
                .map(|m| m.as_str().starts_with("</"))
                .unwrap_or(false)
            {
                "</em>".to_string()
            } else {
                "<em>".to_string()
            }
        })
        .into_owned();

    out = re_div_open().replace_all(&out, "<p>").into_owned();
    out = re_div_close().replace_all(&out, "</p>").into_owned();
    out = strip_disallowed_tags(&out);

    out = re_nbsp().replace_all(&out, " ").into_owned();
    out = re_empty_p().replace_all(&out, "").into_owned();
    out = re_multi_br().replace_all(&out, "<br /><br />").into_owned();
    out = re_whitespace().replace_all(&out, " ").into_owned();
    out = out.replace("\r\n", "\n").replace('\r', "\n");
    while out.contains("\n\n\n") {
        out = out.replace("\n\n\n", "\n\n");
    }
    out = out.trim().to_string();

    let after_tags = count_tags(&out);
    let stripped = before_tags.saturating_sub(after_tags);

    HtmlPasteResult {
        changed: out != original.trim(),
        html: out,
        source: "rust".into(),
        stripped_tags: stripped,
    }
}

fn count_tags(html: &str) -> usize {
    re_any_tag().find_iter(html).count()
}

fn rewrite_anchors(html: &str) -> String {
    re_href()
        .replace_all(html, |caps: &regex::Captures| {
            let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let href = extract_attr(attrs, "href").unwrap_or_default();
            if href.is_empty() || href.starts_with("javascript:") {
                "<a>".to_string()
            } else {
                format!(r#"<a href="{}">"#, escape_attr(&href))
            }
        })
        .into_owned()
}

fn rewrite_images(html: &str) -> String {
    re_img()
        .replace_all(html, |caps: &regex::Captures| {
            let attrs = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let src = extract_attr(attrs, "src").unwrap_or_default();
            let alt = extract_attr(attrs, "alt").unwrap_or_default();
            if src.is_empty() || src.starts_with("file:") {
                String::new()
            } else {
                format!(
                    r#"<img src="{}" alt="{}">"#,
                    escape_attr(&src),
                    escape_attr(&alt)
                )
            }
        })
        .into_owned()
}

fn extract_attr(attrs: &str, name: &str) -> Option<String> {
    let re = re_attr_value(name);
    let caps = re.captures(attrs)?;
    Some(
        caps.get(1)
            .or_else(|| caps.get(2))
            .or_else(|| caps.get(3))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default(),
    )
}

fn escape_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn strip_disallowed_tags(html: &str) -> String {
    re_any_tag()
        .replace_all(html, |caps: &regex::Captures| {
            let tag = caps.get(0).map(|m| m.as_str()).unwrap_or("");
            if re_allowed_open().is_match(tag) {
                simplify_allowed_tag(tag)
            } else {
                String::new()
            }
        })
        .into_owned()
}

fn simplify_allowed_tag(tag: &str) -> String {
    let lower = tag.to_ascii_lowercase();
    if lower.starts_with("<a ") || lower == "<a>" || lower.starts_with("</a") {
        return tag.to_string();
    }
    if lower.starts_with("<img") {
        return tag.to_string();
    }
    if lower.starts_with("<br") {
        return "<br />".into();
    }
    if lower.starts_with("<hr") {
        return "<hr />".into();
    }
    let name = tag
        .trim_start_matches(['<', '/'])
        .split(|c: char| c.is_whitespace() || c == '>' || c == '/')
        .next()
        .unwrap_or("p");
    if tag.starts_with("</") {
        format!("</{name}>")
    } else if tag.ends_with("/>") {
        format!("<{name} />")
    } else {
        format!("<{name}>")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_word_noise() {
        let dirty = r#"
            <html xmlns:o="urn:schemas-microsoft-com:office:office">
            <head><style>p { mso-fareast-font-family: Arial; }</style></head>
            <body>
            <!--[if gte mso 9]><xml></xml><![endif]-->
            <p class="MsoNormal" style="margin:0"><span style="font-size:12pt">Hello <b>world</b></span></p>
            <o:p>&nbsp;</o:p>
            </body></html>
        "#;
        assert!(looks_like_dirty_html(dirty));
        let result = normalize_clipboard_html(dirty);
        assert!(result.changed);
        assert!(result.html.contains("<p>"));
        assert!(result.html.contains("<strong>world</strong>"));
        assert!(!result.html.to_ascii_lowercase().contains("mso"));
        assert!(!result.html.contains("<span"));
        assert!(!result.html.contains("style="));
    }

    #[test]
    fn keeps_links_and_lists() {
        let html = r#"<div style="color:red"><ul><li><a href="https://example.com" class="x">Link</a></li></ul></div>"#;
        let result = normalize_clipboard_html(html);
        assert!(result.html.contains(r#"href="https://example.com""#));
        assert!(result.html.contains("<ul>"));
        assert!(result.html.contains("<li>"));
    }

    #[test]
    fn clean_html_barely_changes() {
        let html = "<p>Plain <em>text</em></p>";
        let result = normalize_clipboard_html(html);
        assert!(result.html.contains("Plain"));
        assert!(result.html.contains("<em>text</em>"));
    }
}
