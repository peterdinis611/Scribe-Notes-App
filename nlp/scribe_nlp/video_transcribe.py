"""Local video ASR for library videos (optional faster-whisper).

Called via JSON-RPC method ``transcribe_video``. Large media stays on disk;
this module only returns text + segments.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any


class TranscribeUnavailable(RuntimeError):
    """Raised when ASR dependencies are not installed."""


def _resolve_source(params: dict[str, Any]) -> Path:
    rel = str(params.get("relPath") or params.get("rel_path") or "").strip()
    source = str(params.get("sourcePath") or params.get("source_path") or "").strip()
    # Prefer absolute sourcePath from Rust (already sandbox-validated).
    if source:
        path = Path(source)
        if path.is_file():
            return path
    if rel:
        # Optional: resolve via Files API root is left to Rust; relative alone is not enough.
        raise TranscribeUnavailable(
            "relPath alone is not readable from the NLP sandbox; pass sourcePath"
        )
    raise TranscribeUnavailable("missing sourcePath")


def transcribe_video(params: dict[str, Any]) -> dict[str, Any]:
    """
    Params:
      sourcePath: absolute path (preferred)
      relPath: sandbox-relative (informational)
      model: whisper model name (default base)
      language: optional language code
    """
    path = _resolve_source(params)
    model = str(params.get("model") or "base").strip() or "base"
    language = params.get("language")
    language = str(language).strip() if language else None

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
    segments: list[dict[str, Any]] = []
    texts: list[str] = []
    for seg in segments_iter:
        text = (seg.text or "").strip()
        if not text:
            continue
        segments.append(
            {
                "start": float(seg.start),
                "end": float(seg.end),
                "text": text,
            }
        )
        texts.append(text)

    return {
        "text": "\n".join(texts).strip(),
        "segments": segments,
        "model": model,
        "language": getattr(info, "language", language),
        "videoId": params.get("videoId") or params.get("video_id"),
    }
