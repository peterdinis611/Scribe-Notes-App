from __future__ import annotations

import hashlib
import math
import re

from .embed_backend import (
    active_backend,
    current_model_id,
    embed_quality,
    quality_available,
)
from .text_utils import tokenize

DEFAULT_DIMS = 384
CHAR_NGRAM = 3

MODEL_ID = current_model_id()


def _hash_features(text: str) -> list[str]:
    tokens = tokenize(text)
    features: list[str] = []

    for token in tokens:
        features.append(f"w:{token}")

    for index in range(len(tokens) - 1):
        features.append(f"b:{tokens[index]}_{tokens[index + 1]}")

    compact = re.sub(r"\s+", " ", (text or "").lower())
    if len(compact) >= CHAR_NGRAM:
        for index in range(len(compact) - CHAR_NGRAM + 1):
            gram = compact[index : index + CHAR_NGRAM]
            if any(ch.isalnum() for ch in gram):
                features.append(f"c:{gram}")

    return features


def _add_feature(vec: list[float], feature: str, dims: int) -> None:
    digest = hashlib.sha256(feature.encode("utf-8")).digest()
    h = int.from_bytes(digest[:8], "big")
    for slot in range(8):
        idx = (h >> (slot * 5)) % dims
        sign = 1.0 if ((h >> (40 + slot)) & 1) else -1.0
        vec[idx] += sign


def _hash_embed(text: str, dims: int = DEFAULT_DIMS) -> list[float]:
    vec = [0.0] * dims
    features = _hash_features(text)
    if not features:
        return vec

    for feature in features:
        _add_feature(vec, feature, dims)

    norm = math.sqrt(sum(value * value for value in vec))
    if norm <= 0:
        return vec
    return [value / norm for value in vec]


def embed_text(text: str, dims: int = DEFAULT_DIMS) -> list[float]:
    if active_backend() == "quality" and quality_available():
        return embed_quality(text)
    return _hash_embed(text, dims=dims)


def embed_batch(texts: list[str], dims: int = DEFAULT_DIMS) -> list[list[float]]:
    if active_backend() == "quality" and quality_available():
        from .embed_backend import _load_quality_model

        model = _load_quality_model()
        vectors = model.encode(texts, normalize_embeddings=True)
        return [[float(value) for value in row.tolist()] for row in vectors]
    return [_hash_embed(text, dims=dims) for text in texts]
