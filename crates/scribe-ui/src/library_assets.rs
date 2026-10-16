//! Storage-mode library asset helpers (kind, filter, format).
//! Keep in sync with FE `src/lib/storage/library-assets.ts` and `python-ui`.

use serde::{Deserialize, Serialize};

/// Filter chips shown in Storage mode (excluding dynamic orphan count label).
pub const LIBRARY_ASSET_KIND_FILTERS: &[&str] =
    &["image", "svg", "lottie", "model3d", "video", "other"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryAssetRow {
    pub path: String,
    pub file_name: String,
    pub extension: String,
    pub kind: String,
    pub size_bytes: u64,
    pub document_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub document_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<i64>,
}

/// Classify a file extension for Storage mode.
pub fn asset_kind(extension: &str) -> &'static str {
    match extension.trim().trim_start_matches('.').to_ascii_lowercase().as_str() {
        "svg" => "svg",
        "json" | "lottie" => "lottie",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "avif" | "apng" => "image",
        "glb" | "gltf" | "usdz" => "model3d",
        "mp4" | "webm" | "ogv" | "ogg" | "mov" | "m3u8" | "mkv" | "m4v" => "video",
        _ => "other",
    }
}

pub fn is_orphan_asset(document_title: Option<&str>) -> bool {
    document_title.map(str::trim).filter(|s| !s.is_empty()).is_none()
}

pub fn is_previewable_kind(kind: &str) -> bool {
    matches!(kind, "image" | "svg")
}

pub fn is_video_kind(kind: &str) -> bool {
    kind == "video"
}

/// Human-readable byte size (B / KB / MB / GB), matching Storage mode UI.
pub fn format_bytes(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".into();
    }
    let units = ["B", "KB", "MB", "GB"];
    let mut value = bytes as f64;
    let mut unit = 0usize;
    while value >= 1024.0 && unit + 1 < units.len() {
        value /= 1024.0;
        unit += 1;
    }
    if value < 10.0 && unit > 0 {
        format!("{value:.1} {}", units[unit])
    } else {
        format!("{} {}", value.round() as u64, units[unit])
    }
}

/// Filter Storage-mode assets by chip + search query.
pub fn filter_library_assets(
    assets: &[LibraryAssetRow],
    filter: &str,
    query: &str,
) -> Vec<LibraryAssetRow> {
    let filter = filter.trim();
    let q = query.trim().to_ascii_lowercase();
    assets
        .iter()
        .filter(|asset| {
            let pass_filter = match filter {
                "" | "all" => true,
                "orphans" => is_orphan_asset(asset.document_title.as_deref()),
                kind => asset.kind == kind,
            };
            if !pass_filter {
                return false;
            }
            if q.is_empty() {
                return true;
            }
            asset.file_name.to_ascii_lowercase().contains(&q)
                || asset.extension.to_ascii_lowercase().contains(&q)
                || asset
                    .document_title
                    .as_deref()
                    .unwrap_or("")
                    .to_ascii_lowercase()
                    .contains(&q)
                || asset.document_id.to_ascii_lowercase().contains(&q)
        })
        .cloned()
        .collect()
}

pub fn library_asset_kind_filters() -> Vec<&'static str> {
    LIBRARY_ASSET_KIND_FILTERS.to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(kind: &str, title: Option<&str>, name: &str) -> LibraryAssetRow {
        LibraryAssetRow {
            path: format!("/tmp/{name}"),
            file_name: name.into(),
            extension: "mp4".into(),
            kind: kind.into(),
            size_bytes: 2048,
            document_id: "d1".into(),
            document_title: title.map(str::to_string),
            modified_at: Some(1),
        }
    }

    #[test]
    fn kind_and_format() {
        assert_eq!(asset_kind("MP4"), "video");
        assert_eq!(asset_kind(".svg"), "svg");
        assert_eq!(asset_kind("glb"), "model3d");
        assert_eq!(format_bytes(0), "0 B");
        assert_eq!(format_bytes(1536), "1.5 KB");
        assert!(is_previewable_kind("image"));
        assert!(is_video_kind("video"));
        assert!(is_orphan_asset(None));
        assert!(!is_orphan_asset(Some("Note")));
    }

    #[test]
    fn filters_kind_orphans_and_query() {
        let assets = vec![
            row("video", Some("Talk"), "a.mp4"),
            row("image", None, "orphan.png"),
            row("video", Some("Other"), "b.webm"),
        ];
        assert_eq!(filter_library_assets(&assets, "video", "").len(), 2);
        assert_eq!(filter_library_assets(&assets, "orphans", "").len(), 1);
        assert_eq!(filter_library_assets(&assets, "all", "talk").len(), 1);
    }
}
