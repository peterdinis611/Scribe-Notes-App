"""Safe local image helpers via Pillow (optional extra).

Requires Pillow **>= 13.0.0** (CVE fixes for 12.3.x and earlier). Soft-import —
missing package returns structured errors instead of crashing the sidecar.
"""

from __future__ import annotations

import base64
import io
from typing import Any

# Cap decompression bombs (Pillow raises DecompressionBombError when exceeded).
MAX_IMAGE_PIXELS = 40_000_000
# Refuse absurd payloads before Pillow parses containers.
MAX_INPUT_BYTES = 48 * 1024 * 1024
# Formats we intentionally support for note / OCR prep (no EPS/PDF/FPX).
ALLOWED_FORMATS = frozenset({"JPEG", "PNG", "WEBP", "GIF", "BMP", "TIFF", "MPO"})
MIN_SAFE_VERSION = (13, 0, 0)


def pillow_available() -> bool:
    try:
        import PIL  # noqa: F401
        from PIL import Image  # noqa: F401

        return True
    except Exception:
        return False


def pillow_version() -> str | None:
    if not pillow_available():
        return None
    try:
        import PIL

        return str(getattr(PIL, "__version__", "") or "") or None
    except Exception:
        return None


def pillow_version_tuple() -> tuple[int, ...] | None:
    raw = pillow_version()
    if not raw:
        return None
    parts: list[int] = []
    for chunk in raw.split("."):
        digits = "".join(ch for ch in chunk if ch.isdigit())
        if not digits:
            break
        parts.append(int(digits))
    return tuple(parts) if parts else None


def pillow_is_patched() -> bool:
    """True when installed Pillow meets the CVE-fixed floor (13.0.0+)."""
    ver = pillow_version_tuple()
    if ver is None:
        return False
    return ver >= MIN_SAFE_VERSION


def _require_pillow() -> Any:
    if not pillow_available():
        raise RuntimeError("Pillow is not installed. pip install 'scribe-nlp[image]'")
    if not pillow_is_patched():
        installed = pillow_version() or "unknown"
        raise RuntimeError(
            f"Pillow {installed} is vulnerable; upgrade to >=13.0.0 "
            "(pip install -U 'pillow>=13.0.0')"
        )
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
    return Image


def _decode_payload(params: dict[str, Any]) -> bytes:
    if isinstance(params.get("bytes"), (bytes, bytearray)):
        data = bytes(params["bytes"])
    else:
        b64 = str(params.get("base64") or params.get("dataBase64") or "").strip()
        if not b64:
            raise ValueError("base64 (or bytes) is required")
        if b64.startswith("data:") and "," in b64:
            b64 = b64.split(",", 1)[1]
        try:
            data = base64.b64decode(b64, validate=False)
        except Exception as exc:
            raise ValueError(f"Invalid base64 image payload: {exc}") from exc
    if not data:
        raise ValueError("Empty image payload")
    if len(data) > MAX_INPUT_BYTES:
        raise ValueError(f"Image exceeds {MAX_INPUT_BYTES} byte limit")
    return data


def _open_safe(Image: Any, data: bytes) -> tuple[Any, str | None]:
    stream = io.BytesIO(data)
    with Image.open(stream) as img:
        fmt = (img.format or "").upper() or None
        if fmt and fmt not in ALLOWED_FORMATS:
            raise ValueError(f"Unsupported image format: {fmt}")
        # Force full decode under MAX_IMAGE_PIXELS before leaving the context.
        img.load()
        # Copy so the file pointer can close (format is cleared on copy).
        return img.copy(), fmt


def inspect_image(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return format / size / mode metadata for a local image payload."""
    Image = _require_pillow()
    data = _decode_payload(params or {})
    img, fmt = _open_safe(Image, data)
    width, height = img.size
    return {
        "ok": True,
        "format": fmt,
        "mode": img.mode,
        "width": int(width),
        "height": int(height),
        "pixels": int(width) * int(height),
        "hasTransparency": img.mode in {"RGBA", "LA", "PA"} or "transparency" in img.info,
        "pillowVersion": pillow_version(),
        "patched": True,
        "source": "python",
    }


def prepare_image_for_ocr(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Normalize an image for Vision / OCR (grayscale PNG, capped long edge)."""
    Image = _require_pillow()
    data = _decode_payload(params or {})
    max_edge = int(params.get("maxEdge") or 2048) if params else 2048
    max_edge = max(256, min(max_edge, 4096))

    img, _fmt = _open_safe(Image, data)
    # Flatten alpha onto white for OCR stability.
    if img.mode in {"RGBA", "LA"} or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        img = Image.alpha_composite(background, rgba).convert("RGB")
    elif img.mode != "RGB":
        img = img.convert("RGB")

    width, height = img.size
    long_edge = max(width, height)
    if long_edge > max_edge:
        scale = max_edge / float(long_edge)
        img = img.resize(
            (max(1, int(width * scale)), max(1, int(height * scale))),
            resample=Image.Resampling.LANCZOS,
        )

    gray = img.convert("L")
    out = io.BytesIO()
    gray.save(out, format="PNG", optimize=True)
    payload = out.getvalue()
    w, h = gray.size
    return {
        "ok": True,
        "mime": "image/png",
        "base64": base64.b64encode(payload).decode("ascii"),
        "width": int(w),
        "height": int(h),
        "bytes": len(payload),
        "pillowVersion": pillow_version(),
        "patched": True,
        "source": "python",
    }
