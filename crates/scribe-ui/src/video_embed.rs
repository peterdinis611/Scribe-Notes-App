//! Video URL classification + provider id extraction.

use serde::{Deserialize, Serialize};

const VIDEO_FILE_EXT: &[&str] = &[".mp4", ".webm", ".ogv", ".ogg", ".mov", ".m3u8"];

const VIDEO_HOSTS: &[&str] = &[
    "youtube.com",
    "youtube-nocookie.com",
    "youtu.be",
    "vimeo.com",
    "player.vimeo.com",
    "dailymotion.com",
    "dai.ly",
    "twitch.tv",
    "facebook.com",
    "fb.watch",
    "fb.com",
    "soundcloud.com",
    "mixcloud.com",
    "streamable.com",
    "wistia.com",
    "wistia.net",
    "tiktok.com",
];

fn has_video_ext(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    let path_only = lower.split(['?', '#']).next().unwrap_or(&lower);
    VIDEO_FILE_EXT.iter().any(|ext| path_only.ends_with(ext))
}

fn parse_host_path(url: &str) -> Option<(String, String, String)> {
    // Returns (host, path, query)
    let trimmed = url.trim();
    let without_scheme = if let Some(rest) = trimmed.strip_prefix("https://") {
        rest
    } else if let Some(rest) = trimmed.strip_prefix("http://") {
        rest
    } else if trimmed.starts_with("asset://") || trimmed.starts_with("file://") {
        return None; // handled separately for is_video_url
    } else {
        return None;
    };
    let (authority, rest) = without_scheme
        .split_once('/')
        .map(|(a, r)| (a, format!("/{r}")))
        .unwrap_or((without_scheme, String::new()));
    let host = authority
        .split('@')
        .next_back()
        .unwrap_or(authority)
        .split(':')
        .next()
        .unwrap_or(authority)
        .to_ascii_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host).to_string();
    let (path, query) = rest
        .split_once('?')
        .map(|(p, q)| (p.to_string(), q.split('#').next().unwrap_or(q).to_string()))
        .unwrap_or_else(|| {
            let p = rest.split('#').next().unwrap_or(&rest).to_string();
            (p, String::new())
        });
    Some((host, path, query))
}

fn query_param(query: &str, key: &str) -> Option<String> {
    for part in query.split('&') {
        let mut kv = part.splitn(2, '=');
        let k = kv.next()?;
        if k == key {
            return Some(kv.next().unwrap_or("").to_string());
        }
    }
    None
}

pub fn is_video_url(value: &str) -> bool {
    let trimmed = value.trim();
    let is_http = trimmed.to_ascii_lowercase().starts_with("http://")
        || trimmed.to_ascii_lowercase().starts_with("https://");
    let is_asset = trimmed.starts_with("asset://") || trimmed.starts_with("file://");
    if !is_http && !is_asset {
        return false;
    }
    if let Some((host, path, _)) = parse_host_path(trimmed) {
        if has_video_ext(&path) {
            return true;
        }
        return VIDEO_HOSTS
            .iter()
            .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")));
    }
    has_video_ext(trimmed)
}

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
        let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
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

pub fn video_provider_label(src: &str) -> String {
    let trimmed = src.trim();
    if extract_youtube_id(trimmed).is_some() {
        return "YouTube".into();
    }
    if extract_vimeo_id(trimmed).is_some() {
        return "Vimeo".into();
    }
    if let Some((host, _, _)) = parse_host_path(trimmed) {
        if host.contains("dailymotion") || host == "dai.ly" {
            return "Dailymotion".into();
        }
        if host.contains("twitch") {
            return "Twitch".into();
        }
        if host.contains("facebook") || host == "fb.watch" || host == "fb.com" {
            return "Facebook".into();
        }
        if host.contains("soundcloud") {
            return "SoundCloud".into();
        }
        if host.contains("mixcloud") {
            return "Mixcloud".into();
        }
        if host.contains("streamable") {
            return "Streamable".into();
        }
        if host.contains("wistia") {
            return "Wistia".into();
        }
        if host.contains("tiktok") {
            return "TikTok".into();
        }
    }
    "Video".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoExportEmbed {
    pub kind: String,
    pub href: String,
}

pub fn video_export_embed(src: &str) -> VideoExportEmbed {
    if let Some(id) = extract_youtube_id(src) {
        return VideoExportEmbed {
            kind: "iframe".into(),
            href: format!("https://www.youtube-nocookie.com/embed/{id}"),
        };
    }
    if let Some(id) = extract_vimeo_id(src) {
        return VideoExportEmbed {
            kind: "iframe".into(),
            href: format!("https://player.vimeo.com/video/{id}"),
        };
    }
    if has_video_ext(src) {
        return VideoExportEmbed {
            kind: "video".into(),
            href: src.into(),
        };
    }
    VideoExportEmbed {
        kind: "link".into(),
        href: src.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn youtube_and_file() {
        assert_eq!(
            extract_youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ").as_deref(),
            Some("dQw4w9WgXcQ")
        );
        assert!(is_video_url("https://cdn.example.com/clip.mp4"));
        assert_eq!(video_provider_label("https://youtu.be/abc"), "YouTube");
    }
}
