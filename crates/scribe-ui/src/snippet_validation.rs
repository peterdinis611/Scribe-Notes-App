//! Snippet TipTap JSON sanitize + validate (allowlists / soft limits).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy)]
pub struct SnippetLimits {
    pub name_max: usize,
    pub id_max: usize,
    pub plain_text_max: usize,
    pub content_nodes_max: usize,
    pub content_depth_max: usize,
    pub content_serialized_max: usize,
    pub custom_snippets_max: usize,
    pub icon_max: usize,
    pub hint_max: usize,
    pub keywords_max: usize,
    pub keyword_length_max: usize,
}

pub const SNIPPET_LIMITS: SnippetLimits = SnippetLimits {
    name_max: 80,
    id_max: 64,
    plain_text_max: 50_000,
    content_nodes_max: 400,
    content_depth_max: 24,
    content_serialized_max: 200_000,
    custom_snippets_max: 100,
    icon_max: 16,
    hint_max: 160,
    keywords_max: 12,
    keyword_length_max: 32,
};

const ALLOWED_NODE_TYPES: &[&str] = &[
    "doc", "paragraph", "text", "hardBreak", "heading", "blockquote", "codeBlock",
    "horizontalRule", "bulletList", "orderedList", "listItem", "taskList", "taskItem",
    "table", "tableRow", "tableCell", "tableHeader", "image", "resizableImage", "video",
    "youtube", "lottieAnimation", "model3d", "callout", "details", "detailsSummary",
    "detailsContent", "mathInline", "mathBlock", "mermaidDiagram", "d3Chart", "leafletMap",
    "footnote", "pageBreak", "tableOfContents", "wikiLink", "wikiEmbed", "emoji", "mention",
];

const ALLOWED_MARK_TYPES: &[&str] = &[
    "bold", "italic", "underline", "strike", "code", "link", "highlight", "textStyle",
    "subscript", "superscript", "comment",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SnippetValidationError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedSnippetInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    pub plain_text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keywords: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub favorite: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum SnippetValidationResult {
    Ok { ok: bool, value: ParsedSnippetInput },
    Err { ok: bool, error: SnippetValidationError },
}

fn fail(code: &str, message: impl Into<String>) -> SnippetValidationResult {
    SnippetValidationResult::Err {
        ok: false,
        error: SnippetValidationError {
            code: code.into(),
            message: message.into(),
        },
    }
}

pub fn is_valid_snippet_id(id: &str) -> bool {
    if id.is_empty() || id.len() > SNIPPET_LIMITS.id_max {
        return false;
    }
    let mut chars = id.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_alphanumeric() {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '-'))
}

fn is_plain_object(value: &Value) -> bool {
    value.is_object()
}

fn count_nodes(nodes: &[Value]) -> usize {
    let mut total = 0usize;
    fn walk(node: &Value, total: &mut usize) {
        *total += 1;
        if let Some(children) = node.get("content").and_then(|c| c.as_array()) {
            for child in children {
                walk(child, total);
            }
        }
    }
    for node in nodes {
        walk(node, &mut total);
    }
    total
}

fn max_depth(nodes: &[Value], depth: usize) -> usize {
    let mut deepest = depth;
    for node in nodes {
        if let Some(children) = node.get("content").and_then(|c| c.as_array()) {
            if !children.is_empty() {
                deepest = deepest.max(max_depth(children, depth + 1));
            }
        }
    }
    deepest
}

pub fn sanitize_json_content(value: &Value, depth: usize) -> Option<Value> {
    if depth > SNIPPET_LIMITS.content_depth_max {
        return None;
    }
    if !is_plain_object(value) {
        return None;
    }
    let typ = value.get("type")?.as_str()?;
    if !ALLOWED_NODE_TYPES.contains(&typ) {
        return None;
    }

    let mut next = serde_json::Map::new();
    next.insert("type".into(), Value::String(typ.into()));

    if let Some(attrs) = value.get("attrs") {
        if attrs.is_null() {
            // skip
        } else if !is_plain_object(attrs) {
            return None;
        } else {
            next.insert("attrs".into(), attrs.clone());
        }
    }

    if typ == "text" {
        let text = value.get("text")?.as_str()?;
        next.insert("text".into(), Value::String(text.into()));
    }

    if let Some(marks) = value.get("marks").and_then(|m| m.as_array()) {
        let mut cleaned_marks = Vec::new();
        for mark in marks {
            if !is_plain_object(mark) {
                continue;
            }
            let Some(mark_type) = mark.get("type").and_then(|t| t.as_str()) else {
                continue;
            };
            if !ALLOWED_MARK_TYPES.contains(&mark_type) {
                continue;
            }
            let mut cleaned = serde_json::Map::new();
            cleaned.insert("type".into(), Value::String(mark_type.into()));
            if let Some(attrs) = mark.get("attrs") {
                if attrs.is_null() {
                } else if !is_plain_object(attrs) {
                    continue;
                } else {
                    cleaned.insert("attrs".into(), attrs.clone());
                }
            }
            cleaned_marks.push(Value::Object(cleaned));
        }
        if !cleaned_marks.is_empty() {
            next.insert("marks".into(), Value::Array(cleaned_marks));
        }
    }

    if let Some(children) = value.get("content").and_then(|c| c.as_array()) {
        let mut out = Vec::new();
        for child in children {
            if let Some(sanitized) = sanitize_json_content(child, depth + 1) {
                out.push(sanitized);
            }
        }
        if !out.is_empty() {
            next.insert("content".into(), Value::Array(out));
        }
    }

    Some(Value::Object(next))
}

pub fn sanitize_json_content_list(value: &Value) -> Option<Vec<Value>> {
    if let Some(arr) = value.as_array() {
        let nodes: Vec<_> = arr
            .iter()
            .filter_map(|item| sanitize_json_content(item, 0))
            .collect();
        return if nodes.is_empty() { None } else { Some(nodes) };
    }
    sanitize_json_content(value, 0).map(|n| vec![n])
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateSnippetInput {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub plain_text: Option<String>,
    #[serde(default)]
    pub content: Option<Value>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub hint: Option<String>,
    #[serde(default)]
    pub keywords: Option<Vec<String>>,
    #[serde(default)]
    pub favorite: Option<bool>,
}

pub fn validate_snippet_input(
    input: &ValidateSnippetInput,
    existing_custom_count: Option<usize>,
    is_update: bool,
) -> SnippetValidationResult {
    let name = input.name.trim();
    if name.is_empty() {
        return fail("name_required", "Snippet name is required");
    }
    if name.len() > SNIPPET_LIMITS.name_max {
        return fail(
            "name_too_long",
            format!(
                "Snippet name must be at most {} characters",
                SNIPPET_LIMITS.name_max
            ),
        );
    }

    let mut id = None;
    if let Some(raw_id) = &input.id {
        let trimmed = raw_id.trim();
        if trimmed.is_empty() || !is_valid_snippet_id(trimmed) {
            return fail("id_invalid", "Snippet id has an invalid format");
        }
        id = Some(trimmed.to_string());
    }

    let content = input
        .content
        .as_ref()
        .and_then(sanitize_json_content_list);
    if input.content.is_some() && content.is_none() {
        return fail("content_invalid", "Snippet TipTap content is invalid");
    }

    if let Some(ref nodes) = content {
        if count_nodes(nodes) > SNIPPET_LIMITS.content_nodes_max {
            return fail(
                "content_too_many_nodes",
                format!(
                    "Snippet content exceeds {} nodes",
                    SNIPPET_LIMITS.content_nodes_max
                ),
            );
        }
        if max_depth(nodes, 1) > SNIPPET_LIMITS.content_depth_max {
            return fail(
                "content_too_deep",
                format!(
                    "Snippet content exceeds depth {}",
                    SNIPPET_LIMITS.content_depth_max
                ),
            );
        }
        let Ok(serialized) = serde_json::to_string(nodes) else {
            return fail("content_invalid", "Snippet TipTap content is invalid");
        };
        if serialized.len() > SNIPPET_LIMITS.content_serialized_max {
            return fail(
                "content_too_large",
                format!(
                    "Snippet content exceeds {} bytes",
                    SNIPPET_LIMITS.content_serialized_max
                ),
            );
        }
    }

    let plain_text = input
        .plain_text
        .as_deref()
        .unwrap_or("")
        .replace("\r\n", "\n");
    if plain_text.len() > SNIPPET_LIMITS.plain_text_max {
        return fail(
            "body_too_large",
            format!(
                "Snippet body must be at most {} characters",
                SNIPPET_LIMITS.plain_text_max
            ),
        );
    }
    if content.is_none() && plain_text.trim().is_empty() {
        return fail("body_required", "Snippet body is required");
    }

    let icon = match &input.icon {
        Some(raw) if !raw.is_empty() => {
            let trimmed = raw.trim();
            if trimmed.is_empty() || trimmed.len() > SNIPPET_LIMITS.icon_max {
                return fail(
                    "icon_invalid",
                    format!(
                        "Snippet icon must be at most {} characters",
                        SNIPPET_LIMITS.icon_max
                    ),
                );
            }
            Some(trimmed.to_string())
        }
        _ => None,
    };

    let hint = match &input.hint {
        Some(raw) if !raw.is_empty() => {
            let trimmed = raw.trim();
            if trimmed.len() > SNIPPET_LIMITS.hint_max {
                return fail(
                    "hint_too_long",
                    format!(
                        "Snippet hint must be at most {} characters",
                        SNIPPET_LIMITS.hint_max
                    ),
                );
            }
            Some(trimmed.to_string())
        }
        _ => None,
    };

    let keywords = match &input.keywords {
        None => None,
        Some(items) => {
            if items.len() > SNIPPET_LIMITS.keywords_max {
                return fail(
                    "keywords_invalid",
                    format!(
                        "At most {} keywords are allowed",
                        SNIPPET_LIMITS.keywords_max
                    ),
                );
            }
            let mut out = Vec::new();
            for item in items {
                let trimmed = item.trim().to_lowercase();
                if trimmed.is_empty() {
                    continue;
                }
                if trimmed.len() > SNIPPET_LIMITS.keyword_length_max {
                    return fail(
                        "keywords_invalid",
                        format!(
                            "Each keyword must be at most {} characters",
                            SNIPPET_LIMITS.keyword_length_max
                        ),
                    );
                }
                if !out.contains(&trimmed) {
                    out.push(trimmed);
                }
            }
            if out.is_empty() {
                None
            } else {
                Some(out)
            }
        }
    };

    if !is_update {
        if let Some(count) = existing_custom_count {
            if count >= SNIPPET_LIMITS.custom_snippets_max {
                return fail(
                    "too_many_snippets",
                    format!(
                        "At most {} custom snippets are allowed",
                        SNIPPET_LIMITS.custom_snippets_max
                    ),
                );
            }
        }
    }

    SnippetValidationResult::Ok {
        ok: true,
        value: ParsedSnippetInput {
            id,
            name: name.to_string(),
            plain_text,
            content,
            icon,
            hint,
            keywords,
            favorite: input.favorite,
        },
    }
}

/// Allowed node type ids (for FE sync / tests).
pub fn allowed_snippet_node_types() -> Vec<String> {
    ALLOWED_NODE_TYPES.iter().map(|s| (*s).to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_and_validates() {
        let input = ValidateSnippetInput {
            id: None,
            name: "Hello".into(),
            plain_text: Some("body".into()),
            content: Some(json!({
                "type": "paragraph",
                "content": [{ "type": "text", "text": "hi" }]
            })),
            icon: None,
            hint: None,
            keywords: None,
            favorite: None,
        };
        match validate_snippet_input(&input, None, false) {
            SnippetValidationResult::Ok { ok, value } => {
                assert!(ok);
                assert_eq!(value.name, "Hello");
                assert!(value.content.is_some());
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn drops_unknown_nodes() {
        let dirty = json!({
            "type": "evilScript",
            "content": []
        });
        assert!(sanitize_json_content(&dirty, 0).is_none());
    }
}
