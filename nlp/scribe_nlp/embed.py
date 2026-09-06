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
from .text_utils import content_tokens, tokenize

DEFAULT_DIMS = 384
CHAR_NGRAM = 3
# First N content tokens get a mild boost (title / lead emphasis).
LEAD_TOKEN_BOOST = 1.35
LEAD_TOKEN_COUNT = 24

MODEL_ID = current_model_id()


def _hash_features(text: str) -> list[tuple[str, float]]:
    """Feature → weight pairs for hash embedding v3."""
    source = text or ""
    all_tokens = tokenize(source)
    content = content_tokens(source)
    features: list[tuple[str, float]] = []

    # Prefer content tokens (stopwords stripped); fall back to all tokens.
    word_tokens = content if content else all_tokens
    for index, token in enumerate(word_tokens):
        weight = LEAD_TOKEN_BOOST if index < LEAD_TOKEN_COUNT else 1.0
        features.append((f"w:{token}", weight))

    for index in range(len(word_tokens) - 1):
        left, right = word_tokens[index], word_tokens[index + 1]
        if left == right:
            continue
        weight = LEAD_TOKEN_BOOST if index < LEAD_TOKEN_COUNT else 1.0
        features.append((f"b:{left}_{right}", weight))

    # Char n-grams on full lowercased text capture morphology / diacritics.
    compact = re.sub(r"\s+", " ", source.lower())
    if len(compact) >= CHAR_NGRAM:
        for index in range(len(compact) - CHAR_NGRAM + 1):
            gram = compact[index : index + CHAR_NGRAM]
            if any(ch.isalnum() for ch in gram):
                features.append((f"c:{gram}", 0.55))

    return features


def _add_feature(vec: list[float], feature: str, weight: float, dims: int) -> None:
    digest = hashlib.sha256(feature.encode("utf-8")).digest()
    h = int.from_bytes(digest[:8], "big")
    for slot in range(8):
        idx = (h >> (slot * 5)) % dims
        sign = 1.0 if ((h >> (40 + slot)) & 1) else -1.0
        vec[idx] += sign * weight


def _hash_embed(text: str, dims: int = DEFAULT_DIMS) -> list[float]:
    vec = [0.0] * dims
    features = _hash_features(text)
    if not features:
        return vec

    for feature, weight in features:
        _add_feature(vec, feature, weight, dims)

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


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    return sum(a * b for a, b in zip(left, right))
