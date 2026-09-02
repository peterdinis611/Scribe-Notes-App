from __future__ import annotations

import os
from typing import Literal

EmbedBackend = Literal["hash", "quality"]

HASH_MODEL_ID = "scribe-hash-v2"
QUALITY_MODEL_ID = "scribe-minilm-v1"
QUALITY_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"

_active_backend: EmbedBackend = "hash"
_quality_model = None


def configure_backend(value: str | None) -> EmbedBackend:
    global _active_backend
    if value == "quality" and quality_available():
        _active_backend = "quality"
    else:
        _active_backend = "hash"
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


def _load_quality_model():
    global _quality_model
    if _quality_model is not None:
        return _quality_model
    from sentence_transformers import SentenceTransformer

    _quality_model = SentenceTransformer(QUALITY_MODEL_NAME)
    return _quality_model


def embed_quality(text: str) -> list[float]:
    model = _load_quality_model()
    vector = model.encode(text or "", normalize_embeddings=True)
    return [float(value) for value in vector.tolist()]
