"""Optional Model2Vec static embeddings (middle path: hash ↔ MiniLM)."""

from __future__ import annotations

import os
from pathlib import Path

from .extras import has_model2vec

# Multilingual-friendly default; override with SCRIBE_M2V_MODEL.
DEFAULT_M2V_MODEL = "minishlab/potion-multilingual-128M"
FAST_MODEL_ID = "scribe-m2v-v1"

_fast_model = None


def fast_available() -> bool:
    return has_model2vec()


def _cache_dir() -> Path:
    override = os.environ.get("SCRIBE_M2V_CACHE", "").strip()
    if override:
        path = Path(override).expanduser()
    else:
        path = Path.home() / ".cache" / "scribe-nlp" / "model2vec"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _model_name() -> str:
    return os.environ.get("SCRIBE_M2V_MODEL", "").strip() or DEFAULT_M2V_MODEL


def _load_model():
    global _fast_model
    if _fast_model is not None:
        return _fast_model
    if not has_model2vec():
        raise RuntimeError("model2vec is not installed (pip install 'scribe-nlp[fast-embed]')")
    from model2vec import StaticModel

    # Cache dir is used by huggingface_hub via HF_HOME / local path when applicable.
    os.environ.setdefault("HF_HOME", str(_cache_dir() / "hf"))
    _fast_model = StaticModel.from_pretrained(_model_name())
    return _fast_model


def warmup_fast_model() -> bool:
    if not fast_available():
        return False
    try:
        model = _load_model()
        model.encode(["warmup"])
        return True
    except Exception:
        return False


def _normalize_rows(matrix) -> list[list[float]]:
    import math

    rows: list[list[float]] = []
    for row in matrix:
        values = [float(value) for value in row]
        norm = math.sqrt(sum(value * value for value in values))
        if norm <= 0:
            rows.append(values)
        else:
            rows.append([value / norm for value in values])
    return rows


def embed_fast(text: str) -> list[float]:
    model = _load_model()
    vector = model.encode([text or ""])[0]
    return _normalize_rows([vector])[0]


def embed_fast_batch(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = _load_model()
    matrix = model.encode([item or "" for item in texts])
    return _normalize_rows(matrix)
