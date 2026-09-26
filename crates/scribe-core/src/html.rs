//! Structural TipTap JSON to HTML rendering.
//!
//! This is the subset of `src/lib/export/html.ts` that needs no browser: text,
//! headings, lists, quotes, code and rules. Rich embeds (Mermaid, D3, maps,
//! media) stay in TypeScript and are skipped here.

use serde_json::Value;

pub fn tiptap_to_html(content_json: &str, title: &str, include_title_heading: bool) -> String {
    let doc: Value = serde_json::from_str(content_json).unwrap_or(Value::Null);

    let mut out = String::from("<article class=\"scribe-export\">");
    if include_title_heading {
        out.push_str("<h1>");
        push_escaped(&mut out, title);
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
            push_text_align(node, out);
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
            push_text_align(node, out);
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
            if language.is_empty() {
                out.push_str("<pre><code>");
            } else {
                out.push_str("<pre><code class=\"language-");
                push_escaped(out, language);
                out.push_str("\">");
            }
            push_escaped(out, &collect_text(node));
            out.push_str("</code></pre>");
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

fn push_text_align(node: &Value, out: &mut String) {
    let align = node
        .pointer("/attrs/textAlign")
        .and_then(Value::as_str)
        .unwrap_or("");
    if matches!(align, "center" | "right" | "justify") {
        out.push_str(&format!(" style=\"text-align:{align}\""));
    }
}

fn render_text(node: &Value, out: &mut String) {
    let text = node.get("text").and_then(Value::as_str).unwrap_or("");
    let marks = node.get("marks").and_then(Value::as_array);

    let Some(marks) = marks.filter(|marks| !marks.is_empty()) else {
        push_escaped(out, text);
        return;
    };

    // Marks wrap the accumulated markup in order, like the TypeScript reducer.
    let mut rendered = escape_html(text);
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
        assert!(html.contains("<pre><code class=\"language-rust\">let x = 1 &lt; 2;</code></pre>"));
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
}
