//! Structural TipTap JSON to HTML rendering.
//!
//! This is the subset of `src/lib/export/html.ts` that needs no browser: text,
//! headings, lists, quotes, code and rules. Rich embeds (Mermaid, D3, maps,
//! media) stay in TypeScript and are skipped here.
//!
use serde_json::Value;
use unicode_normalization::UnicodeNormalization;

pub fn tiptap_to_html(content_json: &str, title: &str, include_title_heading: bool) -> String {
    let doc: Value = serde_json::from_str(content_json).unwrap_or(Value::Null);

    let mut out = String::from("<article class=\"scribe-export\">");
    if include_title_heading {
        out.push_str("<h1>");
        push_escaped(&mut out, &to_nfc(title));
        out.push_str("</h1>");
    }
    render_children(&doc, &mut out);
    out.push_str("</article>");
    out
}

pub fn escape_html(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    push_escaped(&mut out, text);
    out
}

fn to_nfc(text: &str) -> String {
    text.nfc().collect()
}

fn push_escaped(out: &mut String, text: &str) {
    for ch in text.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(ch),
        }
    }
}

fn render_children(node: &Value, out: &mut String) {
    let Some(children) = node.get("content").and_then(Value::as_array) else {
        return;
    };
    for child in children {
        render_node(child, out);
    }
}

fn render_node(node: &Value, out: &mut String) {
    match node.get("type").and_then(Value::as_str) {
        Some("text") => render_text(node, out),
        Some("hardBreak") => out.push_str("<br />"),
        Some("paragraph") => {
            out.push_str("<p");
            push_block_attrs(node, out);
            out.push('>');
            render_children(node, out);
            out.push_str("</p>");
        }
        Some("heading") => {
            let level = node
                .pointer("/attrs/level")
                .and_then(Value::as_i64)
                .unwrap_or(1)
                .clamp(1, 6);
            out.push_str(&format!("<h{level}"));
            push_block_attrs(node, out);
            out.push('>');
            render_children(node, out);
            out.push_str(&format!("</h{level}>"));
        }
        Some("bulletList") => wrap(node, "<ul>", "</ul>", out),
        Some("orderedList") => {
            let start = node.pointer("/attrs/start").and_then(Value::as_i64);
            match start {
                Some(start) if start != 1 => {
                    out.push_str(&format!("<ol start=\"{start}\">"));
                }
                _ => out.push_str("<ol>"),
            }
            render_children(node, out);
            out.push_str("</ol>");
        }
        Some("listItem") => wrap(node, "<li>", "</li>", out),
        Some("taskList") => wrap(node, "<ul data-type=\"taskList\">", "</ul>", out),
        Some("taskItem") => {
            let checked = node
                .pointer("/attrs/checked")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            out.push_str("<li data-type=\"taskItem\"><input type=\"checkbox\"");
            if checked {
                out.push_str(" checked");
            }
            out.push_str(" disabled />");
            render_children(node, out);
            out.push_str("</li>");
        }
        Some("blockquote") => wrap(node, "<blockquote>", "</blockquote>", out),
        Some("codeBlock") => {
            let language = node
                .pointer("/attrs/language")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            // Code content is left byte-for-byte as authored: no Unicode
            // normalization here, since normalizing code could silently
            // change it.
            let code = collect_text(node);
            if let Some(highlighted) = crate::syntax_highlight::highlight_code_html(language, &code)
            {
                // syntect emits a self-contained <pre style=…>…</pre>.
                out.push_str("<div class=\"scribe-code-block\"");
                if !language.is_empty() {
                    out.push_str(" data-language=\"");
                    push_escaped(out, language);
                    out.push('"');
                }
                out.push('>');
                out.push_str(&highlighted);
                out.push_str("</div>");
            } else if language.is_empty() {
                out.push_str("<pre><code>");
                push_escaped(out, &code);
                out.push_str("</code></pre>");
            } else {
                out.push_str("<pre><code class=\"language-");
                push_escaped(out, language);
                out.push_str("\">");
                push_escaped(out, &code);
                out.push_str("</code></pre>");
            }
        }
        Some("horizontalRule") => out.push_str("<hr />"),
        Some("paintPad") => {
            let ocr = node
                .pointer("/attrs/ocrText")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            out.push_str("<figure data-type=\"paint-pad\"><p>Paint pad</p>");
            if !ocr.is_empty() {
                out.push_str("<figcaption>");
                push_escaped(out, ocr);
                out.push_str("</figcaption>");
            }
            out.push_str("</figure>");
        }
        // Unknown nodes keep their children so no content is lost.
        _ => render_children(node, out),
    }
}

fn wrap(node: &Value, open: &str, close: &str, out: &mut String) {
    out.push_str(open);
    render_children(node, out);
    out.push_str(close);
}

/// Emits `dir="rtl"` (when the block's text is predominantly right-to-left)
/// and an inline `text-align` style, on `<p>` / `<hn>` opening tags.
fn push_block_attrs(node: &Value, out: &mut String) {
    if text_direction(&collect_text(node)) == Some("rtl") {
        out.push_str(" dir=\"rtl\"");
    }

    let align = node
        .pointer("/attrs/textAlign")
        .and_then(Value::as_str)
        .unwrap_or("");
    if matches!(align, "center" | "right" | "justify") {
        out.push_str(&format!(" style=\"text-align:{align}\""));
    }
}

/// Returns the direction implied by the first "strong" (directionally
/// significant) character in `text`: `Some("rtl")` for Hebrew/Arabic-script
/// text, `Some("ltr")` for other alphabetic text, or `None` when the text has
/// no directionally strong characters at all (e.g. empty, digits/punctuation
/// only).
fn text_direction(text: &str) -> Option<&'static str> {
    for ch in text.chars() {
        let cp = ch as u32;
        let is_rtl = matches!(cp,
            0x0590..=0x05FF   // Hebrew
            | 0x0600..=0x06FF // Arabic
            | 0x0700..=0x074F // Syriac
            | 0x0750..=0x077F // Arabic Supplement
            | 0x0780..=0x07BF // Thaana
            | 0x07C0..=0x07FF // NKo
            | 0x0800..=0x083F // Samaritan
            | 0x0840..=0x085F // Mandaic
            | 0x08A0..=0x08FF // Arabic Extended-A
            | 0xFB1D..=0xFB4F // Hebrew presentation forms
            | 0xFB50..=0xFDFF // Arabic presentation forms A
            | 0xFE70..=0xFEFF // Arabic presentation forms B
        );
        if is_rtl {
            return Some("rtl");
        }
        if ch.is_alphabetic() {
            return Some("ltr");
        }
    }
    None
}

fn render_text(node: &Value, out: &mut String) {
    let raw = node.get("text").and_then(Value::as_str).unwrap_or("");
    let text = to_nfc(raw);

    let marks = node.get("marks").and_then(Value::as_array);

    let Some(marks) = marks.filter(|marks| !marks.is_empty()) else {
        push_escaped(out, &text);
        return;
    };

    // Marks wrap the accumulated markup in order, like the TypeScript reducer.
    let mut rendered = escape_html(&text);
    for mark in marks {
        rendered = apply_mark(mark, rendered);
    }
    out.push_str(&rendered);
}

fn apply_mark(mark: &Value, inner: String) -> String {
    match mark.get("type").and_then(Value::as_str) {
        Some("bold") => format!("<strong>{inner}</strong>"),
        Some("italic") => format!("<em>{inner}</em>"),
        Some("underline") => format!("<u>{inner}</u>"),
        Some("strike") => format!("<s>{inner}</s>"),
        Some("code") => format!("<code>{inner}</code>"),
        Some("link") => {
            let href = mark
                .pointer("/attrs/href")
                .and_then(Value::as_str)
                .unwrap_or("#");
            format!("<a href=\"{}\">{inner}</a>", escape_html(href))
        }
        Some("highlight") => {
            let color = mark
                .pointer("/attrs/color")
                .and_then(Value::as_str)
                .unwrap_or("#fff3a3");
            format!(
                "<mark style=\"background:{}\">{inner}</mark>",
                escape_html(color)
            )
        }
        Some("textStyle") => {
            let mut styles: Vec<String> = Vec::new();
            if let Some(color) = mark.pointer("/attrs/color").and_then(Value::as_str) {
                styles.push(format!("color:{}", escape_html(color)));
            }
            if let Some(family) = mark.pointer("/attrs/fontFamily").and_then(Value::as_str) {
                styles.push(format!("font-family:{}", escape_html(family)));
            }
            if styles.is_empty() {
                inner
            } else {
                format!("<span style=\"{}\">{inner}</span>", styles.join(";"))
            }
        }
        _ => inner,
    }
}

fn collect_text(node: &Value) -> String {
    if let Some(text) = node.get("text").and_then(Value::as_str) {
        return text.to_string();
    }
    node.get("content")
        .and_then(Value::as_array)
        .map(|children| children.iter().map(collect_text).collect::<String>())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_small_document() {
        let json = r#"{
            "type": "doc",
            "content": [
                { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Kapitola" }] },
                { "type": "paragraph", "content": [
                    { "type": "text", "text": "Hello " },
                    { "type": "text", "text": "world", "marks": [{ "type": "bold" }, { "type": "italic" }] },
                    { "type": "hardBreak" },
                    { "type": "text", "text": "5 > 3 & \"safe\"" }
                ] },
                { "type": "bulletList", "content": [
                    { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "item" }] }] }
                ] },
                { "type": "horizontalRule" }
            ]
        }"#;

        let html = tiptap_to_html(json, "Titul", true);

        assert_eq!(
            html,
            concat!(
                "<article class=\"scribe-export\">",
                "<h1>Titul</h1>",
                "<h2>Kapitola</h2>",
                "<p>Hello <em><strong>world</strong></em><br />5 &gt; 3 &amp; &quot;safe&quot;</p>",
                "<ul><li><p>item</p></li></ul>",
                "<hr />",
                "</article>",
            )
        );
    }

    #[test]
    fn omits_title_heading_when_not_requested() {
        let html = tiptap_to_html(r#"{"type":"doc","content":[]}"#, "Titul", false);
        assert_eq!(html, "<article class=\"scribe-export\"></article>");
    }

    #[test]
    fn renders_links_quotes_code_and_tasks() {
        let json = r#"{
            "type": "doc",
            "content": [
                { "type": "blockquote", "content": [{ "type": "paragraph", "content": [
                    { "type": "text", "text": "docs", "marks": [{ "type": "link", "attrs": { "href": "https://a.b?x=1&y=2" } }] }
                ] }] },
                { "type": "codeBlock", "attrs": { "language": "rust" }, "content": [{ "type": "text", "text": "let x = 1 < 2;" }] },
                { "type": "taskList", "content": [
                    { "type": "taskItem", "attrs": { "checked": true }, "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "done" }] }] },
                    { "type": "taskItem", "attrs": { "checked": false }, "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "todo" }] }] }
                ] }
            ]
        }"#;

        let html = tiptap_to_html(json, "", false);

        assert!(html.contains(
            "<blockquote><p><a href=\"https://a.b?x=1&amp;y=2\">docs</a></p></blockquote>"
        ));
        assert!(html.contains("data-language=\"rust\""));
        assert!(html.contains("<pre"));
        assert!(html.contains("<span"));
        assert!(html.contains("let") || html.contains("x"));
        assert!(!html.contains("<pre><code class=\"language-rust\">"));
        assert!(html.contains(
            "<li data-type=\"taskItem\"><input type=\"checkbox\" checked disabled /><p>done</p></li>"
        ));
        assert!(html.contains(
            "<li data-type=\"taskItem\"><input type=\"checkbox\" disabled /><p>todo</p></li>"
        ));
    }

    #[test]
    fn renders_text_styles_and_alignment() {
        let json = r##"{
            "type": "doc",
            "content": [
                { "type": "paragraph", "attrs": { "textAlign": "center" }, "content": [
                    { "type": "text", "text": "tinted", "marks": [
                        { "type": "textStyle", "attrs": { "color": "#ff0055", "fontFamily": "Fraunces" } },
                        { "type": "highlight", "attrs": { "color": "#fff3a3" } }
                    ] }
                ] }
            ]
        }"##;

        let html = tiptap_to_html(json, "", false);

        assert!(html.contains("<p style=\"text-align:center\">"));
        assert!(html.contains(
            "<mark style=\"background:#fff3a3\"><span style=\"color:#ff0055;font-family:Fraunces\">tinted</span></mark>"
        ));
    }

    #[test]
    fn unknown_nodes_keep_their_children() {
        let json = r#"{"type":"doc","content":[
            {"type":"callout","content":[{"type":"paragraph","content":[{"type":"text","text":"note"}]}]},
            {"type":"mermaidDiagram","attrs":{"source":"graph TD;"}}
        ]}"#;

        let html = tiptap_to_html(json, "", false);
        assert_eq!(
            html,
            "<article class=\"scribe-export\"><p>note</p></article>"
        );
    }

    #[test]
    fn invalid_json_yields_empty_article() {
        assert_eq!(
            tiptap_to_html("not json", "T", true),
            "<article class=\"scribe-export\"><h1>T</h1></article>"
        );
    }

    #[test]
    fn renders_rtl_paragraph_with_dir_attr() {
        let json = r#"{
            "type": "doc",
            "content": [
                { "type": "paragraph", "content": [{ "type": "text", "text": "\u0645\u0631\u062d\u0628\u0627" }] },
                { "type": "heading", "attrs": { "level": 1 }, "content": [{ "type": "text", "text": "\u05e9\u05dc\u05d5\u05dd" }] },
                { "type": "paragraph", "content": [{ "type": "text", "text": "Hello" }] }
            ]
        }"#;

        let html = tiptap_to_html(json, "", false);

        assert!(html.contains("<p dir=\"rtl\">"));
        assert!(html.contains("<h1 dir=\"rtl\">"));
        assert!(!html.contains("<p dir=\"rtl\">Hello"));
    }

    #[test]
    fn combines_rtl_dir_with_text_align() {
        let json = r#"{
            "type": "doc",
            "content": [
                { "type": "paragraph", "attrs": { "textAlign": "right" }, "content": [
                    { "type": "text", "text": "\u0645\u0631\u062d\u0628\u0627" }
                ] }
            ]
        }"#;

        let html = tiptap_to_html(json, "", false);
        assert!(html.contains("<p dir=\"rtl\" style=\"text-align:right\">"));
    }

    #[test]
    fn normalizes_combining_diacritics_to_nfc() {
        // "é" written as "e" + combining acute accent (U+0065 U+0301)
        let decomposed = "e\u{0301}cole";
        let json = format!(
            r#"{{"type":"doc","content":[{{"type":"paragraph","content":[{{"type":"text","text":"{decomposed}"}}]}}]}}"#
        );

        let html = tiptap_to_html(&json, "", false);

        // NFC precomposed form: U+00E9 ("é")
        assert!(html.contains("<p>\u{00e9}cole</p>"));
        assert!(!html.contains(decomposed));
    }
}