//! Provider classification and display labels.

use crate::detect::has_video_ext;
use crate::extract::{
    extract_bilibili_id, extract_dailymotion_id, extract_loom_id, extract_streamable_id,
    extract_tiktok_id, extract_twitch_id, extract_vimeo_id, extract_wistia_id, extract_youtube_id,
};
use crate::url::parse_host_path;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VideoProvider {
    #[serde(rename = "youtube")]
    YouTube,
    Vimeo,
    Dailymotion,
    Twitch,
    Facebook,
    #[serde(rename = "soundcloud")]
    SoundCloud,
    Mixcloud,
    Streamable,
    Wistia,
    #[serde(rename = "tiktok")]
    TikTok,
    Loom,
    Bilibili,
    File,
    Unknown,
}

impl VideoProvider {
    pub fn label(self) -> &'static str {
        match self {
            Self::YouTube => "YouTube",
            Self::Vimeo => "Vimeo",
            Self::Dailymotion => "Dailymotion",
            Self::Twitch => "Twitch",
            Self::Facebook => "Facebook",
            Self::SoundCloud => "SoundCloud",
            Self::Mixcloud => "Mixcloud",
            Self::Streamable => "Streamable",
            Self::Wistia => "Wistia",
            Self::TikTok => "TikTok",
            Self::Loom => "Loom",
            Self::Bilibili => "Bilibili",
            Self::File => "Video",
            Self::Unknown => "Video",
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::YouTube => "youtube",
            Self::Vimeo => "vimeo",
            Self::Dailymotion => "dailymotion",
            Self::Twitch => "twitch",
            Self::Facebook => "facebook",
            Self::SoundCloud => "soundcloud",
            Self::Mixcloud => "mixcloud",
            Self::Streamable => "streamable",
            Self::Wistia => "wistia",
            Self::TikTok => "tiktok",
            Self::Loom => "loom",
            Self::Bilibili => "bilibili",
            Self::File => "file",
            Self::Unknown => "unknown",
        }
    }
}

pub fn detect_provider(src: &str) -> VideoProvider {
    let trimmed = src.trim();
    if extract_youtube_id(trimmed).is_some() {
        return VideoProvider::YouTube;
    }
    if extract_vimeo_id(trimmed).is_some() {
        return VideoProvider::Vimeo;
    }
    if extract_dailymotion_id(trimmed).is_some() {
        return VideoProvider::Dailymotion;
    }
    if extract_twitch_id(trimmed).is_some() {
        return VideoProvider::Twitch;
    }
    if extract_loom_id(trimmed).is_some() {
        return VideoProvider::Loom;
    }
    if extract_tiktok_id(trimmed).is_some() {
        return VideoProvider::TikTok;
    }
    if extract_streamable_id(trimmed).is_some() {
        return VideoProvider::Streamable;
    }
    if extract_wistia_id(trimmed).is_some() {
        return VideoProvider::Wistia;
    }
    if extract_bilibili_id(trimmed).is_some() {
        return VideoProvider::Bilibili;
    }
    if let Some((host, path, _)) = parse_host_path(trimmed) {
        if host.contains("facebook") || host == "fb.watch" || host == "fb.com" {
            return VideoProvider::Facebook;
        }
        if host.contains("soundcloud") {
            return VideoProvider::SoundCloud;
        }
        if host.contains("mixcloud") {
            return VideoProvider::Mixcloud;
        }
        if host.contains("wistia") {
            return VideoProvider::Wistia;
        }
        if host.contains("bilibili") || host == "b23.tv" {
            return VideoProvider::Bilibili;
        }
        if has_video_ext(&path) {
            return VideoProvider::File;
        }
    }
    if has_video_ext(trimmed) {
        return VideoProvider::File;
    }
    VideoProvider::Unknown
}

pub fn video_provider_label(src: &str) -> String {
    detect_provider(src).label().into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_known_providers() {
        assert_eq!(
            detect_provider("https://youtu.be/abc"),
            VideoProvider::YouTube
        );
        assert_eq!(
            detect_provider("https://www.loom.com/share/deadbeef"),
            VideoProvider::Loom
        );
        assert_eq!(video_provider_label("https://vimeo.com/1"), "Vimeo");
    }
}
