"""Optional FAISS cosine search over embedding vectors."""

from __future__ import annotations

from .extras import has_faiss


def faiss_available() -> bool:
    return has_faiss()


def faiss_top_k(
    query: list[float],
    vectors: list[list[float]],
    *,
    limit: int = 8,
) -> list[tuple[int, float]]:
    """Return (index, cosine_score) for top matches. Empty if FAISS unavailable."""
    if not query or not vectors or not has_faiss():
        return []
    try:
        import faiss
        import numpy as np

        matrix = np.asarray(vectors, dtype=np.float32)
        if matrix.ndim != 2 or matrix.shape[0] == 0:
            return []
        # Assume already L2-normalized → inner product == cosine.
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms = np.clip(norms, 1e-12, None)
        matrix = matrix / norms
        q = np.asarray([query], dtype=np.float32)
        q = q / np.clip(np.linalg.norm(q, axis=1, keepdims=True), 1e-12, None)

        index = faiss.IndexFlatIP(matrix.shape[1])
        index.add(matrix)
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
