from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

EmbedBackend = Literal["hash", "quality"]

HASH_MODEL_ID = "scribe-hash-v4"
QUALITY_MODEL_ID = "scribe-minilm-v1"
QUALITY_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"

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
    if value == "quality" and quality_available():
        _active_backend = "quality"
    else:
        _active_backend = "hash"
    if _active_backend != previous and _on_backend_change is not None:
        _on_backend_change()
    return _active_backend


def active_backend() -> EmbedBackend:
    env = os.environ.get("SCRIBE_EMBED_BACKEND", "").strip().lower()
    if env == "quality" and quality_available():
        return "quality"
    return _active_backend


def current_model_id() -> str:
    if active_backend() == "quality":
        return QUALITY_MODEL_ID
    return HASH_MODEL_ID


def quality_available() -> bool:
    try:
        import sentence_transformers  # noqa: F401
        return True
    except ImportError:
        return False


def quality_cache_dir() -> Path:
    override = os.environ.get("SCRIBE_ST_CACHE", "").strip()
    if override:
        path = Path(override).expanduser()
    else:
        path = Path.home() / ".cache" / "scribe-nlp" / "models"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _load_quality_model():
    global _quality_model
    if _quality_model is not None:
        return _quality_model
    from sentence_transformers import SentenceTransformer

    _quality_model = SentenceTransformer(
        QUALITY_MODEL_NAME,
        cache_folder=str(quality_cache_dir()),
    )
    return _quality_model


def embed_quality(text: str) -> list[float]:
    model = _load_quality_model()
    vector = model.encode(text or "", normalize_embeddings=True)
    return [float(value) for value in vector.tolist()]


def embed_quality_batch(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = _load_quality_model()
    vectors = model.encode(texts, normalize_embeddings=True, batch_size=min(32, len(texts)))
    return [[float(value) for value in row.tolist()] for row in vectors]
