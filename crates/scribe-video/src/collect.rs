//! Walk TipTap JSON and collect video blocks / bare video URLs.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::detect::is_video_url;
use crate::inspect_video;
use crate::markdown::VideoBlockAttrs;
use crate::VideoInfo;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CollectedVideo {
    pub attrs: VideoBlockAttrs,
    pub info: VideoInfo,
    /// Path-like index hint: e.g. `"0.2.1"`.
    pub path: String,
}

fn walk(node: &Value, path: &str, out: &mut Vec<CollectedVideo>) {
    let Some(obj) = node.as_object() else {
        return;
    };
    let ty = obj.get("type").and_then(|t| t.as_str()).unwrap_or("");
    if ty == "video" || ty == "youtube" {
        let attrs_val = obj.get("attrs");
        let src = attrs_val
            .and_then(|a| a.get("src"))
            .and_then(|s| s.as_str())
            .map(str::to_string);
        let caption = attrs_val
            .and_then(|a| a.get("caption"))
            .and_then(|s| s.as_str())
            .map(str::to_string);
        let attrs = VideoBlockAttrs { src: src.clone(), caption };
        let info = inspect_video(src.as_deref().unwrap_or(""));
        out.push(CollectedVideo {
            attrs,
            info,
            path: path.to_string(),
        });
    }

    // Text nodes that are just a video URL.
    if ty == "text" {
        if let Some(text) = obj.get("text").and_then(|t| t.as_str()) {
            let trimmed = text.trim();
            if is_video_url(trimmed) {
                let attrs = VideoBlockAttrs {
                    src: Some(trimmed.to_string()),
                    caption: None,
                };
                out.push(CollectedVideo {
                    attrs,
                    info: inspect_video(trimmed),
                    path: path.to_string(),
                });
            }
        }
    }

    if let Some(children) = obj.get("content").and_then(|c| c.as_array()) {
        for (i, child) in children.iter().enumerate() {
            let child_path = if path.is_empty() {
                i.to_string()
            } else {
                format!("{path}.{i}")
            };
            walk(child, &child_path, out);
        }
    }
}

/// Collect video nodes (and optional bare URL text) from a TipTap doc JSON value.
pub fn collect_videos_from_tiptap(doc: &Value) -> Vec<CollectedVideo> {
    let mut out = Vec::new();
    walk(doc, "", &mut out);
    out
}

/// Convenience: parse JSON string first.
pub fn collect_videos_from_tiptap_json(content_json: &str) -> Vec<CollectedVideo> {
    match serde_json::from_str::<Value>(content_json) {
        Ok(doc) => collect_videos_from_tiptap(&doc),
        Err(_) => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn collects_video_nodes() {
        let doc = json!({
            "type": "doc",
            "content": [
                { "type": "video", "attrs": { "src": "https://youtu.be/abc", "caption": "A" } },
                { "type": "paragraph", "content": [{ "type": "text", "text": "hi" }] }
            ]
        });
        let found = collect_videos_from_tiptap(&doc);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].info.provider.as_str(), "youtube");
        assert_eq!(found[0].attrs.caption.as_deref(), Some("A"));
    }
}
