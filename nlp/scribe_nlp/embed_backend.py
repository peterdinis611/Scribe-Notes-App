from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

EmbedBackend = Literal["hash", "fast", "quality"]

HASH_MODEL_ID = "scribe-hash-v4"
FAST_MODEL_ID = "scribe-m2v-v1"
QUALITY_MODEL_ID = "scribe-minilm-v1"
ONNX_MODEL_ID = "scribe-minilm-onnx-v1"
QUALITY_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
QUALITY_BATCH_SIZE = 64

_active_backend: EmbedBackend = "hash"
_quality_model = None
_on_backend_change = None


def set_backend_change_hook(callback) -> None:
    """Register a callback (e.g. clear embed LRU) when backend switches."""
    global _on_backend_change
    _on_backend_change = callback


def configure_backend(value: str | None) -> EmbedBackend:
    global _active_backend
    previous = _active_backend
    normalized = (value or "hash").strip().lower()
    if normalized == "quality" and quality_available():
        _active_backend = "quality"
    elif normalized == "fast" and fast_available():
        _active_backend = "fast"
    else:
        _active_backend = "hash"
    if _active_backend != previous and _on_backend_change is not None:
        _on_backend_change()
    return _active_backend


def active_backend() -> EmbedBackend:
    env = os.environ.get("SCRIBE_EMBED_BACKEND", "").strip().lower()
    if env == "quality" and quality_available():
        return "quality"
    if env == "fast" and fast_available():
        return "fast"
    return _active_backend


def current_model_id() -> str:
    backend = active_backend()
    if backend == "quality":
        if _prefer_onnx():
            return ONNX_MODEL_ID
        return QUALITY_MODEL_ID
    if backend == "fast":
        return FAST_MODEL_ID
    return HASH_MODEL_ID


def st_available() -> bool:
    try:
        import sentence_transformers  # noqa: F401

        return True
    except ImportError:
        return False


def onnx_quality_available() -> bool:
    try:
        from .onnx_embed import onnx_available

        if onnx_available():
            return True
        from .extras import has_onnx, has_tokenizers

        return has_onnx() and has_tokenizers()
    except Exception:
        return False


def quality_available() -> bool:
    return st_available() or onnx_quality_available()


def fast_available() -> bool:
    try:
        from .fast_embed import fast_available as _fast

        return _fast()
    except Exception:
        return False


def _prefer_onnx() -> bool:
    """Prefer ONNX when deps+model ready (or SCRIBE_EMBED_ENGINE=onnx)."""
    engine = os.environ.get("SCRIBE_EMBED_ENGINE", "").strip().lower()
    if engine == "st":
        return False
    if engine == "onnx":
        return onnx_quality_available()
    try:
        from .onnx_embed import onnx_available

        if onnx_available():
            return True
        if not st_available() and onnx_quality_available():
            return True
    except Exception:
        pass
    return False


def quality_cache_dir() -> Path:
    override = os.environ.get("SCRIBE_ST_CACHE", "").strip()
    if override:
        path = Path(override).expanduser()
    else:
        path = Path.home() / ".cache" / "scribe-nlp" / "models"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _resolve_device() -> str:
    override = os.environ.get("SCRIBE_ST_DEVICE", "").strip().lower()
    if override in {"cpu", "cuda", "mps"}:
        return override
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def _load_quality_model():
    global _quality_model
    if _quality_model is not None:
        return _quality_model
    from sentence_transformers import SentenceTransformer

    _quality_model = SentenceTransformer(
        QUALITY_MODEL_NAME,
        cache_folder=str(quality_cache_dir()),
        device=_resolve_device(),
    )
    return _quality_model


def warmup_quality_model() -> bool:
    """Eager-load MiniLM / ONNX when quality is active. Returns True if loaded."""
    if active_backend() != "quality" or not quality_available():
        return False
    if _prefer_onnx():
        try:
            from .onnx_embed import ensure_onnx_assets, embed_onnx

            if ensure_onnx_assets():
                embed_onnx("warmup")
                return True
        except Exception:
            pass
        if not st_available():
            return False
    _load_quality_model()
    return True


def warmup_fast_model() -> bool:
    if active_backend() != "fast" or not fast_available():
        return False
    try:
        from .fast_embed import warmup_fast_model as _warmup

        return _warmup()
    except Exception:
        return False


def embed_quality(text: str) -> list[float]:
    if _prefer_onnx():
        try:
            from .onnx_embed import embed_onnx

            vector = embed_onnx(text or "")
            if vector:
                return vector
        except Exception:
            pass
        if not st_available():
            raise RuntimeError("ONNX embed failed and sentence-transformers is not installed")
    model = _load_quality_model()
    vector = model.encode(text or "", normalize_embeddings=True)
    return [float(value) for value in vector.tolist()]


def embed_quality_batch(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    if _prefer_onnx():
        try:
            from .onnx_embed import embed_onnx_batch

            vectors = embed_onnx_batch(texts)
            if vectors is not None and len(vectors) == len(texts):
                return vectors
        except Exception:
            pass
        if not st_available():
            raise RuntimeError("ONNX embed failed and sentence-transformers is not installed")
    model = _load_quality_model()
    batch_size = min(QUALITY_BATCH_SIZE, max(1, len(texts)))
    vectors = model.encode(
        texts,
        normalize_embeddings=True,
        batch_size=batch_size,
        show_progress_bar=False,
    )
    return [[float(value) for value in row.tolist()] for row in vectors]


def embed_fast(text: str) -> list[float]:
    from .fast_embed import embed_fast as _embed

    return _embed(text)


def embed_fast_batch(texts: list[str]) -> list[list[float]]:
    from .fast_embed import embed_fast_batch as _embed_batch

    return _embed_batch(texts)
