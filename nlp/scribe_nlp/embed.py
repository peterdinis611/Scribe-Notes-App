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

# Frozen at import for hash-default unit tests; runtime paths use current_model_id().
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


def _quality_units(texts: list[str]) -> tuple[list[str], list[tuple[int, int, int]]]:
    """Flatten documents into MiniLM encode units.

    Returns (flat_texts, owners) where each owner is
    (document_index, start_inclusive, end_exclusive) into flat_texts.
    """
    flat: list[str] = []
    owners: list[tuple[int, int, int]] = []
    for doc_index, text in enumerate(texts):
        source = text or ""
        if len(source) < CHUNK_POOL_THRESHOLD:
            start = len(flat)
            flat.append(source)
            owners.append((doc_index, start, start + 1))
            continue

        chunks = chunk_text(source)
        if not chunks:
            start = len(flat)
            flat.append(source)
            owners.append((doc_index, start, start + 1))
            continue

        start = len(flat)
        flat.extend(chunks)
        owners.append((doc_index, start, len(flat)))
    return flat, owners


def _embed_batch_quality(texts: list[str]) -> list[list[float]]:
    flat, owners = _quality_units(texts)
    if not flat:
        return [[0.0] * DEFAULT_DIMS for _ in texts]

    vectors = embed_quality_batch(flat)
    results: list[list[float]] = [[0.0] * DEFAULT_DIMS for _ in texts]
    for doc_index, start, end in owners:
        slice_vecs = vectors[start:end]
        if len(slice_vecs) == 1:
            results[doc_index] = slice_vecs[0]
        else:
            results[doc_index] = _mean_pool(slice_vecs)
    return results


def embed_batch(texts: list[str], dims: int = DEFAULT_DIMS) -> list[list[float]]:
    """Embed many texts. Quality backend uses one MiniLM encode pass (plus chunk pooling)."""
    if not texts:
        return []
    if active_backend() == "quality" and quality_available():
        return _embed_batch_quality(texts)
    return [embed_text(text, dims=dims) for text in texts]


def _embed_units(texts: list[str], dims: int = DEFAULT_DIMS) -> list[list[float]]:
    """Embed pre-chunked strings without further chunk pooling."""
    if not texts:
        return []
    if active_backend() == "quality" and quality_available():
        return embed_quality_batch(texts)
    return [_hash_embed(text, dims=dims) for text in texts]


def _document_chunks(text: str) -> list[str]:
    source = text or ""
    if not source.strip():
        return [""]
    if len(source) < CHUNK_POOL_THRESHOLD:
        return [source]
    chunks = chunk_text(source)
    return chunks if chunks else [source]


def embed_with_chunks(text: str, dims: int = DEFAULT_DIMS) -> dict[str, object]:
    """Document vector (mean-pooled) plus per-chunk vectors for indexed search."""
    chunks = _document_chunks(text)
    vectors = _embed_units(chunks, dims=dims)
    document_vector = vectors[0] if len(vectors) == 1 else _mean_pool(vectors)
    return {
        "vector": document_vector,
        "chunks": [
            {
                "index": index,
                "text": chunk,
                "vector": vector,
            }
            for index, (chunk, vector) in enumerate(zip(chunks, vectors))
        ],
        "model": current_model_id(),
        "dims": len(document_vector),
    }


def embed_batch_with_chunks(
    texts: list[str],
    dims: int = DEFAULT_DIMS,
) -> dict[str, object]:
    """Batch variant of embed_with_chunks — one encode pass for quality backend."""
    owners: list[tuple[int, int, int]] = []
    flat: list[str] = []
    for doc_index, text in enumerate(texts):
        chunks = _document_chunks(text)
        start = len(flat)
        flat.extend(chunks)
        owners.append((doc_index, start, len(flat)))

    flat_vectors = _embed_units(flat, dims=dims) if flat else []
    documents: list[dict[str, object]] = []
    for doc_index, start, end in owners:
        chunk_texts = flat[start:end]
        vectors = flat_vectors[start:end]
        document_vector = vectors[0] if len(vectors) == 1 else _mean_pool(vectors)
        documents.append(
            {
                "vector": document_vector,
                "chunks": [
                    {
                        "index": index,
                        "text": chunk,
                        "vector": vector,
                    }
                    for index, (chunk, vector) in enumerate(zip(chunk_texts, vectors))
                ],
            }
        )

    dims_out = 0
    if documents:
        first_vector = documents[0].get("vector")
        if isinstance(first_vector, list):
            dims_out = len(first_vector)
    return {
        "documents": documents,
        "model": current_model_id(),
        "dims": dims_out or dims,
    }


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    return sum(a * b for a, b in zip(left, right))
