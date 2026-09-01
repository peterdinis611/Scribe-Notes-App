from __future__ import annotations

import hashlib
import math

from .text_utils import tokenize

MODEL_ID = "scribe-hash-v1"
DEFAULT_DIMS = 384


def embed_text(text: str, dims: int = DEFAULT_DIMS) -> list[float]:
    vec = [0.0] * dims
    tokens = tokenize(text)
    if not tokens:
        return vec

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        h = int.from_bytes(digest[:8], "big")
        for i in range(6):
            idx = (h >> (i * 6)) % dims
            sign = 1.0 if ((h >> (36 + i)) & 1) else -1.0
            vec[idx] += sign

    norm = math.sqrt(sum(value * value for value in vec))
    if norm <= 0:
        return vec
    return [value / norm for value in vec]


def embed_batch(texts: list[str], dims: int = DEFAULT_DIMS) -> list[list[float]]:
    return [embed_text(text, dims=dims) for text in texts]
