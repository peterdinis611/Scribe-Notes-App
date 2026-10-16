//! Markdown ```video fences and TipTap video node helpers.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::normalize::normalize_video_src;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct VideoBlockAttrs {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub src: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
}

/// Parse a fenced ```video body into attrs (first non-empty line = src).
/// Optional second line / `caption:` prefix becomes caption.
pub fn parse_video_fence(body: &str) -> VideoBlockAttrs {
    let mut src: Option<String> = None;
    let mut caption: Option<String> = None;
    for raw in body.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(rest) = line
            .strip_prefix("caption:")
            .or_else(|| line.strip_prefix("Caption:"))
        {
            let c = rest.trim();
            if !c.is_empty() {
                caption = Some(c.to_string());
            }
            continue;
        }
        if src.is_none() {
            src = Some(normalize_video_src(line));
        } else if caption.is_none() {
            caption = Some(line.to_string());
        }
    }
    VideoBlockAttrs { src, caption }
}

/// Serialize attrs to a ```video fence (with trailing newline).
pub fn video_to_markdown_fence(attrs: &VideoBlockAttrs) -> String {
    let mut lines = vec!["```video".to_string()];
    if let Some(src) = attrs.src.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        lines.push(src.to_string());
    }
    if let Some(caption) = attrs
        .caption
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        lines.push(format!("caption: {caption}"));
    }
    lines.push("```".into());
    lines.push(String::new());
    lines.join("\n")
}

/// TipTap JSON node for a video block.
pub fn video_tiptap_node(attrs: &VideoBlockAttrs) -> Value {
    json!({
        "type": "video",
        "attrs": {
            "src": attrs.src,
            "caption": attrs.caption,
        }
    })
}

/// Promote a codeBlock `{ language: video, text }` into a video node when applicable.
pub fn promote_video_code_block(node: &Value) -> Option<Value> {
    let obj = node.as_object()?;
    if obj.get("type").and_then(|t| t.as_str()) != Some("codeBlock") {
        return None;
    }
    let lang = obj
        .get("attrs")
        .and_then(|a| a.get("language"))
        .and_then(|l| l.as_str())
        .unwrap_or("");
    if !lang.eq_ignore_ascii_case("video") {
        return None;
    }
    let text = obj
        .get("content")
        .and_then(|c| c.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|n| n.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();
    Some(video_tiptap_node(&parse_video_fence(&text)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_fence() {
        let attrs = parse_video_fence("https://youtu.be/abc123\ncaption: Demo clip\n");
        assert_eq!(
            attrs.src.as_deref(),
            Some("https://www.youtube.com/watch?v=abc123")
        );
        assert_eq!(attrs.caption.as_deref(), Some("Demo clip"));
        let md = video_to_markdown_fence(&attrs);
        assert!(md.contains("```video"));
        assert!(md.contains("watch?v=abc123"));
        assert!(md.contains("caption: Demo clip"));
    }

    #[test]
    fn promotes_code_block() {
        let node = json!({
            "type": "codeBlock",
            "attrs": { "language": "video" },
            "content": [{ "type": "text", "text": "https://vimeo.com/1" }]
        });
        let promoted = promote_video_code_block(&node).unwrap();
        assert_eq!(promoted["type"], "video");
        assert_eq!(promoted["attrs"]["src"], "https://vimeo.com/1");
    }
}
