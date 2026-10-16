"""Local video ASR for library videos (optional faster-whisper).

Called via JSON-RPC method ``transcribe_video``. Large media stays on disk;
this module only returns text + segments.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

VIDEO_EXTENSIONS = frozenset(
    {".mp4", ".webm", ".ogv", ".ogg", ".mov", ".m3u8", ".mkv", ".m4v"}
)
ALLOWED_MODELS = frozenset(
    {
        "tiny",
        "tiny.en",
        "base",
        "base.en",
        "small",
        "small.en",
        "medium",
        "medium.en",
        "large-v2",
        "large-v3",
        "distil-large-v3",
    }
)
MIN_VIDEO_BYTES = 64
# Soft cap for ASR — huge files should stay on disk but still need a guardrail.
MAX_ASR_BYTES = 4 * 1024 * 1024 * 1024
MAX_SEGMENT_TEXT = 8_000
MAX_SEGMENTS = 50_000
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
LANG_RE = re.compile(r"^[a-z]{2}(?:-[a-z]{2,8})?$")


class TranscribeUnavailable(RuntimeError):
    """Raised when ASR dependencies are not installed."""


class TranscribeValidationError(ValueError):
    """Invalid RPC params or unsafe/unsupported source file."""


def _require_dict(params: Any) -> dict[str, Any]:
    if not isinstance(params, dict):
        raise TranscribeValidationError("params must be an object")
    return params


def validate_video_id(raw: Any) -> str | None:
    if raw is None:
        return None
    value = str(raw).strip()
    if not value:
        return None
    if not VIDEO_ID_RE.fullmatch(value):
        raise TranscribeValidationError("videoId contains invalid characters")
    return value


def validate_model(raw: Any) -> str:
    model = str(raw or "base").strip().lower() or "base"
    if model not in ALLOWED_MODELS:
        allowed = ", ".join(sorted(ALLOWED_MODELS))
        raise TranscribeValidationError(
            f"Unsupported whisper model '{model}'. Allowed: {allowed}."
        )
    return model


def validate_language(raw: Any) -> str | None:
    if raw is None:
        return None
    value = str(raw).strip().lower()
    if not value:
        return None
    if not LANG_RE.fullmatch(value):
        raise TranscribeValidationError(
            f"Invalid language code '{raw}' (expected ISO 639-1, e.g. sk or en-us)."
        )
    return value


def _has_video_ext(path: Path) -> bool:
    return path.suffix.lower() in VIDEO_EXTENSIONS


def validate_source_path(source: str) -> Path:
    raw = (source or "").strip()
    if not raw:
        raise TranscribeValidationError("missing sourcePath")
    if "\x00" in raw:
        raise TranscribeValidationError("sourcePath contains NUL")
    lower = raw.lower()
    if lower.startswith("http://") or lower.startswith("https://"):
        raise TranscribeValidationError("remote URLs are not allowed for transcription")
    path = Path(raw)
    if not path.is_absolute():
        raise TranscribeValidationError("sourcePath must be an absolute path")
    try:
        resolved = path.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise TranscribeValidationError(f"sourcePath is not readable: {exc}") from exc
    if not resolved.is_file():
        raise TranscribeValidationError("sourcePath is not a file")
    if not _has_video_ext(resolved):
        raise TranscribeValidationError(
            f"unsupported video extension '{resolved.suffix or '(none)'}'"
        )
    try:
        size = resolved.stat().st_size
    except OSError as exc:
        raise TranscribeValidationError(f"cannot stat sourcePath: {exc}") from exc
    if size < MIN_VIDEO_BYTES:
        raise TranscribeValidationError(
            f"video file is too small (min {MIN_VIDEO_BYTES} bytes)"
        )
    if size > MAX_ASR_BYTES:
        raise TranscribeValidationError(
            f"video file exceeds ASR size limit ({MAX_ASR_BYTES} bytes)"
        )
    return resolved


def _resolve_source(params: dict[str, Any]) -> Path:
    rel = str(params.get("relPath") or params.get("rel_path") or "").strip()
    source = str(params.get("sourcePath") or params.get("source_path") or "").strip()
    if source:
        return validate_source_path(source)
    if rel:
        raise TranscribeValidationError(
            "relPath alone is not readable from the NLP sandbox; pass sourcePath"
        )
    raise TranscribeValidationError("missing sourcePath")


def _sanitize_segments(raw_segments: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    segments: list[dict[str, Any]] = []
    texts: list[str] = []
    for seg in raw_segments:
        if len(segments) >= MAX_SEGMENTS:
            break
        text = str(seg.get("text") or "").strip()
        if not text:
            continue
        if len(text) > MAX_SEGMENT_TEXT:
            text = text[:MAX_SEGMENT_TEXT]
        try:
            start = float(seg.get("start", 0.0))
            end = float(seg.get("end", start))
        except (TypeError, ValueError):
            continue
        if not (start >= 0 and end >= start and start < 1e9 and end < 1e9):
            continue
        segments.append({"start": start, "end": end, "text": text})
        texts.append(text)
    return "\n".join(texts).strip(), segments


def transcribe_video(params: dict[str, Any] | Any) -> dict[str, Any]:
    """
    Params:
      sourcePath: absolute path (required)
      relPath: sandbox-relative (informational)
      model: whisper model name (default base)
      language: optional language code
      videoId: optional library id
    """
    params = _require_dict(params)
    path = _resolve_source(params)
    model = validate_model(params.get("model"))
    language = validate_language(params.get("language"))
    video_id = validate_video_id(params.get("videoId") or params.get("video_id"))

    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError as exc:
        raise TranscribeUnavailable(
            "faster-whisper is not installed. "
            "pip install faster-whisper  (or skip transcription)"
        ) from exc

    whisper = WhisperModel(model, device="cpu", compute_type="int8")
    segments_iter, info = whisper.transcribe(
        str(path),
        language=language,
        vad_filter=True,
    )
    raw: list[dict[str, Any]] = []
    for seg in segments_iter:
        raw.append(
            {
                "start": float(getattr(seg, "start", 0.0) or 0.0),
                "end": float(getattr(seg, "end", 0.0) or 0.0),
                "text": (getattr(seg, "text", None) or ""),
            }
        )
    text, segments = _sanitize_segments(raw)

    return {
        "text": text,
        "segments": segments,
        "model": model,
        "language": getattr(info, "language", language),
        "videoId": video_id,
    }
