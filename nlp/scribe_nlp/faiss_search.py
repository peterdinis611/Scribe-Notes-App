"""Vector ANN: FAISS flat by default, optional pynear HNSW for larger corpora.

Built indexes are reused across queries when the candidate matrix fingerprint
matches (avoids rebuild-on-every-search for similar_notes / files Q&A).
"""

from __future__ import annotations

import hashlib
import threading
from typing import Any

from .extras import has_faiss, has_pynear

# Switch to HNSW when candidate set is large enough that flat scan is wasteful.
HNSW_THRESHOLD = 128
_CACHE_MAX = 4

_cache_lock = threading.Lock()
# key -> ("faiss"|"hnsw", index_object, n_vectors)
_index_cache: dict[tuple[Any, ...], tuple[str, Any, int]] = {}


def faiss_available() -> bool:
    return has_faiss() or has_pynear()


def hnsw_available() -> bool:
    return has_pynear()


def clear_faiss_cache() -> None:
    with _cache_lock:
        _index_cache.clear()


def _normalize_matrix(vectors: list[list[float]]):
    import numpy as np

    matrix = np.asarray(vectors, dtype=np.float32)
    if matrix.ndim != 2 or matrix.shape[0] == 0:
        return None, None
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms = np.clip(norms, 1e-12, None)
    return matrix / norms, matrix.shape[1]


def _normalize_query(query: list[float]):
    import numpy as np

    q = np.asarray([query], dtype=np.float32)
    q = q / np.clip(np.linalg.norm(q, axis=1, keepdims=True), 1e-12, None)
    return q


def _matrix_fingerprint(matrix) -> tuple[Any, ...]:
    digest = hashlib.blake2b(matrix.tobytes(), digest_size=16).hexdigest()
    return (int(matrix.shape[0]), int(matrix.shape[1]), digest)


def _cache_get(key: tuple[Any, ...]) -> tuple[str, Any, int] | None:
    with _cache_lock:
        hit = _index_cache.get(key)
        if hit is None:
            return None
        # Refresh LRU order
        _index_cache.pop(key)
        _index_cache[key] = hit
        return hit


def _cache_put(key: tuple[Any, ...], kind: str, index: Any, n: int) -> None:
    with _cache_lock:
        _index_cache[key] = (kind, index, n)
        while len(_index_cache) > _CACHE_MAX:
            _index_cache.pop(next(iter(_index_cache)))


def _parse_hnsw_result(result, matrix_n: int):
    import numpy as np

    indices = None
    scores = None
    if isinstance(result, tuple) and len(result) == 2:
        left, right = result
        left_arr = np.asarray(left)
        right_arr = np.asarray(right)
        if left_arr.dtype.kind in "iu" or (
            left_arr.size
            and left_arr.flat[0] == int(left_arr.flat[0])
            and left_arr.flat[0] < matrix_n
        ):
            indices, scores = left_arr, right_arr
        else:
            scores, indices = left_arr, right_arr
    else:
        return []

    indices = np.asarray(indices).reshape(-1)
    scores = np.asarray(scores, dtype=np.float32).reshape(-1)
    out: list[tuple[int, float]] = []
    for score, idx in zip(scores.tolist(), indices.tolist()):
        if idx is None or int(idx) < 0:
            continue
        value = float(score)
        if value < 0:
            value = max(0.0, 1.0 + value)
        out.append((int(idx), value))
    return out


def _build_hnsw(matrix, dims: int):
    from pynear import HNSWCosineIndex

    index = HNSWCosineIndex(dims)
    if hasattr(index, "add"):
        try:
            index.add(matrix)
        except TypeError:
            for row in matrix:
                index.add(row)
    elif hasattr(index, "fit"):
        index.fit(matrix)
    else:
        return None
    return index


def _search_hnsw(index, q, k: int, matrix_n: int) -> list[tuple[int, float]]:
    if hasattr(index, "search"):
        result = index.search(q[0], k)
    elif hasattr(index, "knn_query"):
        result = index.knn_query(q, k=k)
    else:
        return []
    return _parse_hnsw_result(result, matrix_n)


def _hnsw_top_k(
    query: list[float],
    vectors: list[list[float]],
    *,
    limit: int,
) -> list[tuple[int, float]]:
    try:
        matrix, dims = _normalize_matrix(vectors)
        if matrix is None or dims is None:
            return []
        q = _normalize_query(query)
        key = ("hnsw",) + _matrix_fingerprint(matrix)
        cached = _cache_get(key)
        if cached and cached[0] == "hnsw":
            index = cached[1]
        else:
            index = _build_hnsw(matrix, dims)
            if index is None:
                return []
            _cache_put(key, "hnsw", index, matrix.shape[0])

        k = max(1, min(int(limit), matrix.shape[0]))
        return _search_hnsw(index, q, k, matrix.shape[0])
    except Exception:
        return []


def _faiss_flat_top_k(
    query: list[float],
    vectors: list[list[float]],
    *,
    limit: int,
) -> list[tuple[int, float]]:
    if not has_faiss():
        return []
    try:
        import faiss

        matrix, dims = _normalize_matrix(vectors)
        if matrix is None or dims is None:
            return []
        q = _normalize_query(query)
        key = ("faiss",) + _matrix_fingerprint(matrix)
        cached = _cache_get(key)
        if cached and cached[0] == "faiss":
            index = cached[1]
        else:
            index = faiss.IndexFlatIP(dims)
            index.add(matrix)
            _cache_put(key, "faiss", index, matrix.shape[0])

        k = max(1, min(int(limit), matrix.shape[0]))
        scores, indices = index.search(q, k)
        out: list[tuple[int, float]] = []
        for score, idx in zip(scores[0].tolist(), indices[0].tolist()):
            if idx < 0:
                continue
            out.append((int(idx), float(score)))
        return out
    except Exception:
        return []


def faiss_top_k(
    query: list[float],
    vectors: list[list[float]],
    *,
    limit: int = 8,
) -> list[tuple[int, float]]:
    """Return (index, cosine_score) for top matches.

    Uses pynear HNSW when available and the candidate set is large; otherwise FAISS flat.
    Indexes are cached by matrix fingerprint for reuse across queries.
    """
    if not query or not vectors:
        return []
    limit = max(1, min(int(limit), len(vectors)))

    if has_pynear() and len(vectors) >= HNSW_THRESHOLD:
        hits = _hnsw_top_k(query, vectors, limit=limit)
        if hits:
            return hits

    return _faiss_flat_top_k(query, vectors, limit=limit)
