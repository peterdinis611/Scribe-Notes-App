//! TipTap JSON → Markdown (sync fallback; FE may prefer convert_tiptap).

use serde_json::Value;

fn render_marks(text: &str, marks: &Value) -> String {
    let Some(arr) = marks.as_array() else {
        return text.to_string();
    };
    arr.iter().fold(text.to_string(), |acc, mark| {
        let ty = mark.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match ty {
            "bold" => format!("**{acc}**"),
            "italic" => format!("*{acc}*"),
            "strike" => format!("~~{acc}~~"),
            "code" => format!("`{acc}`"),
            "link" => {
                let href = mark
                    .pointer("/attrs/href")
                    .and_then(|v| v.as_str())
                    .unwrap_or("#");
                format!("[{acc}]({href})")
            }
            _ => acc,
        }
    })
}

fn render_inline(nodes: &Value) -> String {
    let Some(arr) = nodes.as_array() else {
        return String::new();
    };
    arr.iter()
        .map(|node| {
            let ty = node.get("type").and_then(|v| v.as_str()).unwrap_or("");
            match ty {
                "text" => {
                    let text = node.get("text").and_then(|v| v.as_str()).unwrap_or("");
                    let marks = node.get("marks").cloned().unwrap_or(Value::Null);
                    render_marks(text, &marks)
                }
                "hardBreak" => "\n".into(),
                _ => render_inline(node.get("content").unwrap_or(&Value::Null)),
            }
        })
        .collect()
}

fn render_nodes(nodes: &Value) -> String {
    let Some(arr) = nodes.as_array() else {
        return String::new();
    };
    arr.iter()
        .map(|node| {
            let ty = node.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let content = node.get("content").unwrap_or(&Value::Null);
            match ty {
                "paragraph" => format!("{}\n\n", render_inline(content)),
                "heading" => {
                    let level = node
                        .pointer("/attrs/level")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(1)
                        .clamp(1, 6) as usize;
                    format!(
                        "{} {}\n\n",
                        "#".repeat(level),
                        render_inline(content)
                    )
                }
                "codeBlock" => {
                    let lang = node
                        .pointer("/attrs/language")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let raw = content
                        .as_array()
                        .map(|items| {
                            items
                                .iter()
                                .filter_map(|n| n.get("text").and_then(|t| t.as_str()))
                                .collect::<String>()
                        })
                        .unwrap_or_default();
                    format!("```{lang}\n{raw}\n```\n\n")
                }
                "horizontalRule" => "---\n\n".into(),
                "bulletList" => content
                    .as_array()
                    .map(|items| {
                        items
                            .iter()
                            .map(|item| {
                                let inner = item
                                    .pointer("/content/0/content")
                                    .unwrap_or(&Value::Null);
                                format!("- {}\n", render_inline(inner))
                            })
                            .collect::<String>()
                            + "\n"
                    })
                    .unwrap_or_default(),
                _ => render_nodes(content),
            }
        })
        .collect()
}

pub fn tiptap_json_to_markdown(content_json: &str, title: &str) -> String {
    let doc: Value = serde_json::from_str(content_json).unwrap_or(Value::Object(Default::default()));
    let body = render_nodes(doc.get("content").unwrap_or(&Value::Null)).trim().to_string();
    format!("# {title}\n\n{body}\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heading_and_paragraph() {
        let json = r#"{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Hi"}]},{"type":"paragraph","content":[{"type":"text","text":"Body","marks":[{"type":"bold"}]}]}]}"#;
        let md = tiptap_json_to_markdown(json, "Note");
        assert!(md.contains("# Note"));
        assert!(md.contains("# Hi"));
        assert!(md.contains("**Body**"));
    }
}
