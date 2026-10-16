"""Storage-mode library asset helpers (mirrors ``crates/scribe-ui/src/library_assets.rs``)."""

from __future__ import annotations

from typing import Any, Mapping, Sequence

LIBRARY_ASSET_KIND_FILTERS: tuple[str, ...] = (
    "image",
    "svg",
    "lottie",
    "model3d",
    "video",
    "other",
)


def asset_kind(extension: str) -> str:
    ext = (extension or "").strip().lstrip(".").lower()
    if ext == "svg":
        return "svg"
    if ext in {"json", "lottie"}:
        return "lottie"
    if ext in {"png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "apng"}:
        return "image"
    if ext in {"glb", "gltf", "usdz"}:
        return "model3d"
    if ext in {"mp4", "webm", "ogv", "ogg", "mov", "m3u8", "mkv", "m4v"}:
        return "video"
    return "other"


def is_orphan_asset(document_title: str | None) -> bool:
    return not (document_title or "").strip()


def is_previewable_kind(kind: str) -> bool:
    return kind in {"image", "svg"}


def is_video_kind(kind: str) -> bool:
    return kind == "video"


def format_bytes(bytes_value: int) -> str:
    if bytes_value <= 0:
        return "0 B"
    units = ("B", "KB", "MB", "GB")
    value = float(bytes_value)
    unit = 0
    while value >= 1024.0 and unit + 1 < len(units):
        value /= 1024.0
        unit += 1
    if value < 10.0 and unit > 0:
        return f"{value:.1f} {units[unit]}"
    return f"{round(value)} {units[unit]}"


def filter_library_assets(
    assets: Sequence[Mapping[str, Any]],
    filter_id: str = "all",
    query: str = "",
) -> list[Mapping[str, Any]]:
    filt = (filter_id or "all").strip()
    q = (query or "").strip().lower()
    out: list[Mapping[str, Any]] = []
    for asset in assets:
        kind = str(asset.get("kind") or "")
        title = asset.get("documentTitle")
        if isinstance(title, str):
            title_val: str | None = title
        else:
            title_val = None
        if filt == "orphans":
            if not is_orphan_asset(title_val):
                continue
        elif filt not in {"", "all"} and kind != filt:
            continue
        if q:
            file_name = str(asset.get("fileName") or "").lower()
            extension = str(asset.get("extension") or "").lower()
            doc_id = str(asset.get("documentId") or "").lower()
            title_l = (title_val or "").lower()
            if not (
                q in file_name or q in extension or q in title_l or q in doc_id
            ):
                continue
        out.append(asset)
    return out


def library_asset_kind_filters() -> list[str]:
    return list(LIBRARY_ASSET_KIND_FILTERS)
