//! Extract provider-specific video ids from URLs.

use crate::url::{parse_host_path, path_segments, query_param};

pub fn extract_youtube_id(src: &str) -> Option<String> {
    let (host, path, query) = parse_host_path(src)?;
    if host == "youtu.be" {
        let id = path.trim_start_matches('/').split('/').next()?;
        return if id.is_empty() {
            None
        } else {
            Some(id.to_string())
        };
    }
    if host == "youtube.com" || host == "youtube-nocookie.com" || host.ends_with(".youtube.com") {
        if let Some(v) = query_param(&query, "v") {
            if !v.is_empty() {
                return Some(v);
            }
        }
        let parts = path_segments(&path);
        if let Some(marker) = parts
            .iter()
            .position(|p| *p == "embed" || *p == "shorts" || *p == "live")
        {
            if let Some(id) = parts.get(marker + 1) {
                return Some((*id).to_string());
            }
        }
    }
    None
}

pub fn extract_vimeo_id(src: &str) -> Option<String> {
    let (host, path, _) = parse_host_path(src)?;
    if host != "vimeo.com" && host != "player.vimeo.com" {
        return None;
    }
    path.split('/')
        .find(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
        .map(str::to_string)
}

pub fn extract_dailymotion_id(src: &str) -> Option<String> {
    let (host, path, _) = parse_host_path(src)?;
    let parts = path_segments(&path);
    if host == "dai.ly" {
        return parts.first().map(|s| (*s).to_string());
    }
    if host == "dailymotion.com" || host.ends_with(".dailymotion.com") {
        if let Some(marker) = parts.iter().position(|p| *p == "video" || *p == "embed") {
            return parts.get(marker + 1).map(|s| (*s).to_string());
        }
    }
    None
}

/// Twitch channel / clip / video id as `(kind, id)` where kind is `clip` | `video` | `channel`.
pub fn extract_twitch_id(src: &str) -> Option<(String, String)> {
    let (host, path, query) = parse_host_path(src)?;
    let parts = path_segments(&path);
    if host == "clips.twitch.tv" {
        let id = parts.first()?;
        return Some(("clip".into(), (*id).to_string()));
    }
    if host == "twitch.tv" || host.ends_with(".twitch.tv") {
        if parts.first().copied() == Some("videos") {
            let id = parts.get(1)?;
            return Some(("video".into(), (*id).to_string()));
        }
        if parts.first().copied() == Some("clip") {
            let id = parts.get(1)?;
            return Some(("clip".into(), (*id).to_string()));
        }
        if let Some(clip) = query_param(&query, "clip") {
            return Some(("clip".into(), clip));
        }
        if let Some(channel) = parts.first() {
            if !channel.is_empty() {
                return Some(("channel".into(), (*channel).to_string()));
            }
        }
    }
    None
}

pub fn extract_loom_id(src: &str) -> Option<String> {
    let (host, path, _) = parse_host_path(src)?;
    if host != "loom.com" && host != "share.loom.com" && !host.ends_with(".loom.com") {
        return None;
    }
    let parts = path_segments(&path);
    if let Some(marker) = parts
        .iter()
        .position(|p| *p == "share" || *p == "embed")
    {
        return parts.get(marker + 1).map(|s| (*s).to_string());
    }
    None
}

pub fn extract_tiktok_id(src: &str) -> Option<String> {
    let (host, path, _) = parse_host_path(src)?;
    if host != "tiktok.com" && !host.ends_with(".tiktok.com") {
        return None;
    }
    let parts = path_segments(&path);
    if let Some(marker) = parts.iter().position(|p| *p == "video") {
        return parts.get(marker + 1).map(|s| (*s).to_string());
    }
    None
}

pub fn extract_streamable_id(src: &str) -> Option<String> {
    let (host, path, _) = parse_host_path(src)?;
    if host != "streamable.com" && !host.ends_with(".streamable.com") {
        return None;
    }
    let parts = path_segments(&path);
    parts
        .into_iter()
        .find(|p| *p != "e" && *p != "o" && !p.is_empty())
        .map(str::to_string)
}

/// Wistia media hashed id from `/medias/` or embed iframe paths.
pub fn extract_wistia_id(src: &str) -> Option<String> {
    let (host, path, _) = parse_host_path(src)?;
    if !host.contains("wistia") {
        return None;
    }
    let parts = path_segments(&path);
    if let Some(marker) = parts
        .iter()
        .position(|p| *p == "medias" || *p == "iframe" || *p == "embed")
    {
        return parts.get(marker + 1).map(|s| (*s).to_string());
    }
    None
}

/// Bilibili `BV…` id from path or `bvid=` query.
pub fn extract_bilibili_id(src: &str) -> Option<String> {
    let (host, path, query) = parse_host_path(src)?;
    if host != "bilibili.com"
        && !host.ends_with(".bilibili.com")
        && host != "b23.tv"
        && host != "player.bilibili.com"
    {
        return None;
    }
    if let Some(bvid) = query_param(&query, "bvid") {
        if bvid.starts_with("BV") {
            return Some(bvid);
        }
    }
    for part in path_segments(&path) {
        if part.starts_with("BV") && part.len() >= 10 {
            return Some(part.to_string());
        }
    }
    None
}

/// Best-effort primary id string for the detected provider (Twitch returns `kind:id`).
pub fn extract_provider_id(src: &str) -> Option<String> {
    if let Some(id) = extract_youtube_id(src) {
        return Some(id);
    }
    if let Some(id) = extract_vimeo_id(src) {
        return Some(id);
    }
    if let Some(id) = extract_dailymotion_id(src) {
        return Some(id);
    }
    if let Some((kind, id)) = extract_twitch_id(src) {
        return Some(format!("{kind}:{id}"));
    }
    if let Some(id) = extract_loom_id(src) {
        return Some(id);
    }
    if let Some(id) = extract_tiktok_id(src) {
        return Some(id);
    }
    if let Some(id) = extract_streamable_id(src) {
        return Some(id);
    }
    if let Some(id) = extract_wistia_id(src) {
        return Some(id);
    }
    if let Some(id) = extract_bilibili_id(src) {
        return Some(id);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_common_ids() {
        assert_eq!(
            extract_youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ").as_deref(),
            Some("dQw4w9WgXcQ")
        );
        assert_eq!(
            extract_youtube_id("https://www.youtube.com/shorts/abcSHORT").as_deref(),
            Some("abcSHORT")
        );
        assert_eq!(
            extract_vimeo_id("https://vimeo.com/148751763").as_deref(),
            Some("148751763")
        );
        assert_eq!(
            extract_dailymotion_id("https://www.dailymotion.com/video/x7tgad0").as_deref(),
            Some("x7tgad0")
        );
        assert_eq!(
            extract_loom_id("https://www.loom.com/share/deadbeefcafe").as_deref(),
            Some("deadbeefcafe")
        );
        assert_eq!(
            extract_streamable_id("https://streamable.com/abc12").as_deref(),
            Some("abc12")
        );
        assert_eq!(
            extract_twitch_id("https://www.twitch.tv/videos/12345"),
            Some(("video".into(), "12345".into()))
        );
    }
}
