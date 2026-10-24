"""Local video probe / thumbnail via MoviePy 2.x (optional).

MoviePy 2.2.1 still declares ``pillow<12``, which conflicts with the CVE floor
(Pillow >=13.0.0). Install recipe::

    pip install 'scribe-nlp[video]'
    pip install -U 'pillow>=13.0.0'

Runtime refuses to use MoviePy unless Pillow is patched (>=13).
"""

from __future__ import annotations

import base64
import io
from pathlib import Path
from typing import Any

from .image_ops import pillow_is_patched, pillow_version
from .video_transcribe import (
    TranscribeValidationError,
    VIDEO_EXTENSIONS,
    validate_source_path,
)

MAX_THUMB_EDGE = 1280
DEFAULT_THUMB_SEEK = 1.0


class VideoOpsUnavailable(RuntimeError):
    """MoviePy / patched Pillow not available."""


def moviepy_available() -> bool:
    if not pillow_is_patched():
        return False
    try:
        import moviepy  # noqa: F401
        from moviepy import VideoFileClip  # noqa: F401

        return True
    except Exception:
        return False


def moviepy_version() -> str | None:
    if not moviepy_available():
        return None
    try:
        import moviepy

        return str(getattr(moviepy, "__version__", "") or "") or None
    except Exception:
        return None


def _require_moviepy():
    if not pillow_is_patched():
        raise VideoOpsUnavailable(
            f"Pillow {pillow_version() or 'missing'} is below the CVE floor (>=13.0.0). "
            "pip install -U 'pillow>=13.0.0'"
        )
    try:
        from moviepy import VideoFileClip
    except ImportError as exc:
        raise VideoOpsUnavailable(
            "moviepy is not installed. pip install 'scribe-nlp[video]' "
            "then pip install -U 'pillow>=13.0.0'"
        ) from exc
    return VideoFileClip


def _resolve_path(params: dict[str, Any]) -> Path:
    source = str(params.get("sourcePath") or params.get("source_path") or "").strip()
    if not source:
        raise TranscribeValidationError("missing sourcePath")
    return validate_source_path(source)


def probe_video(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return duration / size / fps for a local video file (MoviePy)."""
    VideoFileClip = _require_moviepy()
    path = _resolve_path(params or {})
    clip = None
    try:
        clip = VideoFileClip(str(path))
        duration = float(getattr(clip, "duration", 0.0) or 0.0)
        size = getattr(clip, "size", None) or (None, None)
        width = int(size[0]) if size and size[0] else None
        height = int(size[1]) if size and size[1] else None
        fps = getattr(clip, "fps", None)
        fps_val = float(fps) if fps is not None else None
        return {
            "ok": True,
            "available": True,
            "engine": "moviepy",
            "moviepyVersion": moviepy_version(),
            "pillowVersion": pillow_version(),
            "durationSecs": duration if duration > 0 else None,
            "width": width,
            "height": height,
            "fps": fps_val,
            "codec": None,
            "path": str(path),
            "extension": path.suffix.lower(),
            "source": "python",
        }
    finally:
        if clip is not None:
            try:
                clip.close()
            except Exception:
                pass


def extract_video_thumbnail(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Grab a JPEG frame (base64) at ``atSecs`` for local OCR / library thumbs."""
    from PIL import Image

    VideoFileClip = _require_moviepy()
    params = params or {}
    path = _resolve_path(params)
    at = params.get("atSecs", params.get("at_secs", DEFAULT_THUMB_SEEK))
    try:
        seek = float(at if at is not None else DEFAULT_THUMB_SEEK)
    except (TypeError, ValueError) as exc:
        raise TranscribeValidationError("atSecs must be a number") from exc
    if seek < 0 or seek > 86_400:
        raise TranscribeValidationError("atSecs out of range")

    max_edge = int(params.get("maxEdge") or params.get("max_edge") or MAX_THUMB_EDGE)
    max_edge = max(64, min(max_edge, 2048))

    clip = None
    try:
        clip = VideoFileClip(str(path))
        duration = float(getattr(clip, "duration", 0.0) or 0.0)
        if duration > 0:
            # Stay inside the clip; prefer mid-point when seek is past the end.
            seek = min(seek, max(0.0, duration - 0.05))
        frame = clip.get_frame(seek)  # numpy RGB array
        img = Image.fromarray(frame.astype("uint8"), mode="RGB")
        w, h = img.size
        long_edge = max(w, h)
        if long_edge > max_edge:
            scale = max_edge / float(long_edge)
            img = img.resize(
                (max(1, int(w * scale)), max(1, int(h * scale))),
                resample=Image.Resampling.LANCZOS,
            )
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=85, optimize=True)
        payload = out.getvalue()
        tw, th = img.size
        result: dict[str, Any] = {
            "ok": True,
            "engine": "moviepy",
            "mime": "image/jpeg",
            "base64": base64.b64encode(payload).decode("ascii"),
            "width": int(tw),
            "height": int(th),
            "bytes": len(payload),
            "atSecs": seek,
            "durationSecs": duration if duration > 0 else None,
            "moviepyVersion": moviepy_version(),
            "pillowVersion": pillow_version(),
            "source": "python",
        }
        out_path = str(params.get("outputPath") or params.get("output_path") or "").strip()
        if out_path:
            dest = Path(out_path)
            if not dest.is_absolute():
                raise TranscribeValidationError("outputPath must be absolute")
            if dest.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                raise TranscribeValidationError("outputPath must end with .jpg/.jpeg/.png")
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.suffix.lower() == ".png":
                img.save(dest, format="PNG", optimize=True)
            else:
                img.save(dest, format="JPEG", quality=85, optimize=True)
            result["outputPath"] = str(dest.resolve())
        return result
    finally:
        if clip is not None:
            try:
                clip.close()
            except Exception:
                pass


def supported_video_extensions() -> list[str]:
    return sorted(VIDEO_EXTENSIONS)
