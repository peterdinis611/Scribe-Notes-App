from __future__ import annotations

import hashlib
import math
import re

from .chunking import chunk_text
from .embed_backend import (
    active_backend,
    current_model_id,
    embed_quality,
    embed_quality_batch,
    quality_available,
)
from .normalize import stem_lite
from .text_utils import content_tokens, tokenize

DEFAULT_DIMS = 384
CHAR_NGRAM = 3
LEAD_TOKEN_BOOST = 1.35
LEAD_TOKEN_COUNT = 24
CHUNK_POOL_THRESHOLD = 1_600

MODEL_ID = current_model_id()


def _hash_features(text: str) -> list[tuple[str, float]]:
    source = text or ""
    all_tokens = tokenize(source)
    content = content_tokens(source)
    features: list[tuple[str, float]] = []

    word_tokens = content if content else all_tokens
    stems = [stem_lite(token) for token in word_tokens]
    for index, (token, stem) in enumerate(zip(word_tokens, stems)):
        weight = LEAD_TOKEN_BOOST if index < LEAD_TOKEN_COUNT else 1.0
        features.append((f"w:{token}", weight))
        features.append((f"s:{stem}", weight * 1.15))

    for index in range(len(stems) - 1):
        left, right = stems[index], stems[index + 1]
        if left == right:
            continue
        weight = LEAD_TOKEN_BOOST if index < LEAD_TOKEN_COUNT else 1.0
        features.append((f"b:{left}_{right}", weight))

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


def _mean_pool(vectors: list[list[float]]) -> list[float]:
    if not vectors:
        return [0.0] * DEFAULT_DIMS
    dims = len(vectors[0])
    pooled = [0.0] * dims
    for vector in vectors:
        for index, value in enumerate(vector):
            pooled[index] += value
    scale = 1.0 / len(vectors)
    pooled = [value * scale for value in pooled]
    norm = math.sqrt(sum(value * value for value in pooled))
    if norm <= 0:
        return pooled
    return [value / norm for value in pooled]


def _embed_single_chunk(text: str, dims: int = DEFAULT_DIMS) -> list[float]:
    if active_backend() == "quality" and quality_available():
        return embed_quality(text)
    return _hash_embed(text, dims=dims)


def embed_text(text: str, dims: int = DEFAULT_DIMS) -> list[float]:
    source = text or ""
    if len(source) < CHUNK_POOL_THRESHOLD:
        return _embed_single_chunk(source, dims=dims)

    chunks = chunk_text(source)
    if not chunks:
        return _embed_single_chunk(source, dims=dims)
    if len(chunks) == 1:
        return _embed_single_chunk(chunks[0], dims=dims)

    if active_backend() == "quality" and quality_available():
        vectors = embed_quality_batch(chunks)
    else:
        vectors = [_hash_embed(chunk, dims=dims) for chunk in chunks]
    return _mean_pool(vectors)


def embed_batch(texts: list[str], dims: int = DEFAULT_DIMS) -> list[list[float]]:
    return [embed_text(text, dims=dims) for text in texts]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    return sum(a * b for a, b in zip(left, right))
