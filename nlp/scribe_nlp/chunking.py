from __future__ import annotations

from .text_utils import normalize_text, split_sentences

DEFAULT_CHUNK_CHARS = 1_200
DEFAULT_OVERLAP = 180
MAX_CHUNKS = 24


def chunk_text(
    text: str,
    *,
    max_chars: int = DEFAULT_CHUNK_CHARS,
    overlap: int = DEFAULT_OVERLAP,
    max_chunks: int = MAX_CHUNKS,
) -> list[str]:
    """Split long notes into overlapping chunks for embedding / indexing."""
    source = normalize_text(text)
    if not source:
        return []

    max_chars = max(400, min(int(max_chars or DEFAULT_CHUNK_CHARS), 4_000))
    overlap = max(0, min(int(overlap or DEFAULT_OVERLAP), max_chars // 3))
    max_chunks = max(1, min(int(max_chunks or MAX_CHUNKS), 64))

    if len(source) <= max_chars:
        return [source]

    sentences = split_sentences(source)
    if not sentences:
        return _window_chunks(source, max_chars, overlap, max_chunks)

    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        candidate = f"{current} {sentence}".strip() if current else sentence
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            chunks.append(current)
            if len(chunks) >= max_chunks:
                return chunks
            # Overlap: keep tail of previous chunk.
            if overlap > 0 and len(current) > overlap:
                current = f"{current[-overlap:]} {sentence}".strip()
            else:
                current = sentence
            if len(current) > max_chars:
                chunks.extend(_window_chunks(current, max_chars, overlap, max_chunks - len(chunks)))
                current = ""
                if len(chunks) >= max_chunks:
                    return chunks[:max_chunks]
        else:
            chunks.extend(_window_chunks(sentence, max_chars, overlap, max_chunks - len(chunks)))
            if len(chunks) >= max_chunks:
                return chunks[:max_chunks]
            current = ""

    if current and len(chunks) < max_chunks:
        chunks.append(current)
    return chunks[:max_chunks]


def _window_chunks(text: str, max_chars: int, overlap: int, limit: int) -> list[str]:
    if limit <= 0:
        return []
    if len(text) <= max_chars:
        return [text]
    step = max(1, max_chars - overlap)
    chunks: list[str] = []
    start = 0
    while start < len(text) and len(chunks) < limit:
        end = min(len(text), start + max_chars)
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start += step
    return [chunk for chunk in chunks if chunk]
