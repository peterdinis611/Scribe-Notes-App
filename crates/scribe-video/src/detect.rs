//! Detect whether a string is a playable / embeddable video URL.

use crate::url::parse_host_path;

pub const VIDEO_FILE_EXT: &[&str] = &[
    ".mp4", ".webm", ".ogv", ".ogg", ".mov", ".m3u8", ".mkv", ".m4v",
];

/// Known embed/host platforms (host or suffix match).
pub const VIDEO_HOSTS: &[&str] = &[
    "youtube.com",
    "youtube-nocookie.com",
    "youtu.be",
    "vimeo.com",
    "player.vimeo.com",
    "dailymotion.com",
    "dai.ly",
    "twitch.tv",
    "clips.twitch.tv",
    "facebook.com",
    "fb.watch",
    "fb.com",
    "soundcloud.com",
    "mixcloud.com",
    "streamable.com",
    "wistia.com",
    "wistia.net",
    "tiktok.com",
    "loom.com",
    "share.loom.com",
    "bilibili.com",
    "b23.tv",
];

pub fn has_video_ext(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    let path_only = lower.split(['?', '#']).next().unwrap_or(&lower);
    VIDEO_FILE_EXT.iter().any(|ext| path_only.ends_with(ext))
}

pub fn is_video_url(value: &str) -> bool {
    let trimmed = value.trim();
    let lower = trimmed.to_ascii_lowercase();
    let is_http = lower.starts_with("http://") || lower.starts_with("https://");
    let is_asset = trimmed.starts_with("asset://") || trimmed.starts_with("file://");
    if !is_http && !is_asset {
        return false;
    }
    if is_asset {
        return has_video_ext(trimmed);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_hosts_and_files() {
        assert!(is_video_url("https://www.youtube.com/watch?v=abc"));
        assert!(is_video_url("https://cdn.example.com/clip.mp4"));
        assert!(is_video_url("https://www.loom.com/share/abc123"));
        assert!(is_video_url("asset://localhost/clip.webm"));
        assert!(!is_video_url("https://example.com/notes"));
        assert!(!is_video_url("not-a-url"));
    }
}
