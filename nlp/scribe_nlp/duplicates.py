from __future__ import annotations

from .embed import cosine_similarity, embed_batch, embed_text
from .text_utils import jaccard_similarity, normalize_text


def _blob(document: dict[str, object]) -> str:
    title = str(document.get("title") or "")
    text = str(document.get("text") or "")
    return normalize_text(f"{title}\n{text}")


def find_duplicates(
    documents: list[dict[str, object]],
    *,
    limit: int = 20,
    min_score: float = 0.72,
    use_embeddings: bool = True,
) -> dict[str, object]:
    """Near-duplicate pairs via Jaccard + optional embed cosine (batched MiniLM when quality)."""
    prepared: list[tuple[str, str, str]] = []
    for document in documents:
        doc_id = str(document.get("id") or "")
        if not doc_id:
            continue
        blob = _blob(document)
        if len(blob) < 40:
            continue
        prepared.append((doc_id, str(document.get("title") or "Bez názvu"), blob))

    limit = max(1, min(int(limit or 20), 100))
    pairs: list[dict[str, object]] = []

    vectors: dict[str, list[float]] = {}
    if use_embeddings and prepared:
        blobs = [blob[:8_000] for _doc_id, _title, blob in prepared]
        encoded = embed_batch(blobs)
        for (doc_id, _title, _blob), vector in zip(prepared, encoded):
            vectors[doc_id] = vector

    for index, (left_id, left_title, left_blob) in enumerate(prepared):
        for right_id, right_title, right_blob in prepared[index + 1 :]:
            jac = jaccard_similarity(left_blob, right_blob)
            emb = 0.0
            if use_embeddings:
                emb = max(
                    0.0,
                    cosine_similarity(vectors[left_id], vectors[right_id]),
                )
            score = 0.55 * jac + 0.45 * emb if use_embeddings else jac
            if score < min_score:
                continue
            pairs.append(
                {
                    "leftId": left_id,
                    "leftTitle": left_title,
                    "rightId": right_id,
                    "rightTitle": right_title,
                    "score": round(score, 4),
                    "jaccard": round(jac, 4),
                    "embedScore": round(emb, 4),
                }
            )

    pairs.sort(key=lambda item: (-float(item["score"]), str(item["leftTitle"])))
    return {"pairs": pairs[:limit], "compared": len(prepared)}
