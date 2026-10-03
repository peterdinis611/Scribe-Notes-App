"""Local AI over Storage Files API (`files/` sandbox via loopback REST).

Includes extractive Q&A plus an optional path-scoped embedding index
(namespace separate from note document ids) persisted under
`scratch/.scribe-files-index.json`.
"""

from __future__ import annotations

import hashlib
import io
import re
import zipfile
from typing import Any
from xml.etree import ElementTree as ET

from .embed import cosine_similarity, embed_batch, embed_text
from .chunking import chunk_text
from .storage_fs import StorageFsClient, StorageFsError
from .text_utils import split_sentences

TEXT_EXTENSIONS = {".md", ".txt", ".json", ".csv", ".markdown", ".mdx"}
RICH_TEXT_EXTENSIONS = {".pdf", ".docx"}
INDEXABLE_EXTENSIONS = TEXT_EXTENSIONS | RICH_TEXT_EXTENSIONS
DEFAULT_BASE_URL = "http://127.0.0.1:8787"
INDEX_PATH = "scratch/.scribe-files-index.json"
INDEX_NAMESPACE = "files"


class FilesApiOfflineError(RuntimeError):
    def __init__(self, detail: str = "") -> None:
        message = "FilesApiOffline: Local Files API is not running"
        if detail:
            message = f"{message} ({detail})"
        super().__init__(message)


def _client(base_url: str | None = None) -> StorageFsClient:
    return StorageFsClient((base_url or DEFAULT_BASE_URL).rstrip("/"))


def _ensure_online(client: StorageFsClient) -> dict[str, Any]:
    try:
        return client.health()
    except StorageFsError as exc:
        raise FilesApiOfflineError(str(exc)) from exc


def _is_text_path(path: str) -> bool:
    lower = path.lower()
    return any(lower.endswith(ext) for ext in TEXT_EXTENSIONS)


def _is_indexable_path(path: str) -> bool:
    lower = path.lower()
    return any(lower.endswith(ext) for ext in INDEXABLE_EXTENSIONS)


def _extract_docx_text(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        try:
            xml = archive.read("word/document.xml")
        except KeyError as exc:
            raise ValueError("NotAFile: invalid docx (missing document.xml)") from exc
    root = ET.fromstring(xml)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    parts: list[str] = []
    for node in root.findall(".//w:t", ns):
        if node.text:
            parts.append(node.text)
    return "\n".join(parts).strip()


def _extract_pdf_text(data: bytes) -> str:
    # Optional deps — never required for core NLP.
    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(io.BytesIO(data))
        pages = []
        for page in reader.pages[:40]:
            pages.append(page.extract_text() or "")
        text = "\n".join(pages).strip()
        if text:
            return text
    except Exception:
        pass
    try:
        from pdfminer.high_level import extract_text as pdfminer_extract  # type: ignore

        text = (pdfminer_extract(io.BytesIO(data)) or "").strip()
        if text:
            return text
    except Exception:
        pass
    raise ValueError(
        "NotAFile: PDF text extract needs pypdf or pdfminer.six "
        "(pip install pypdf) — binary media stays out of scope"
    )


def extract_file_text(path: str, data: bytes) -> str:
    lower = path.lower()
    if any(lower.endswith(ext) for ext in TEXT_EXTENSIONS):
        return data.decode("utf-8", errors="replace")
    if lower.endswith(".docx"):
        return _extract_docx_text(data)
    if lower.endswith(".pdf"):
        return _extract_pdf_text(data)
    raise ValueError(f"NotAFile: unsupported type for `{path}`")


def files_list(
    path: str = "",
    *,
    base_url: str | None = None,
    recursive: bool = False,
) -> dict[str, Any]:
    client = _client(base_url)
    _ensure_online(client)
    entries = client.list(path, recursive=recursive)
    return {
        "path": path,
        "count": len(entries),
        "entries": [
            {
                "path": e.path,
                "name": e.name,
                "kind": e.kind,
                "sizeBytes": e.size_bytes,
                "modifiedAt": e.modified_at,
                "extension": e.extension,
                "textLike": e.kind == "file" and _is_indexable_path(e.path),
            }
            for e in entries
        ],
        "source": "files_api",
    }


def _read_path_text(client: StorageFsClient, path: str) -> str:
    if _is_text_path(path):
        return client.read_text(path)
    data = client.read_bytes(path)
    return extract_file_text(path, data)


def files_read_text(path: str, *, base_url: str | None = None) -> dict[str, Any]:
    client = _client(base_url)
    _ensure_online(client)
    if not _is_indexable_path(path):
        raise ValueError(f"NotAFile: unsupported text type for `{path}`")
    text = _read_path_text(client, path)
    return {
        "path": path,
        "text": text,
        "sizeBytes": len(text.encode("utf-8")),
        "source": "files_api",
        "namespace": INDEX_NAMESPACE,
    }


def files_search(
    query: str,
    *,
    path: str = "",
    glob: str | None = None,
    limit: int = 40,
    base_url: str | None = None,
) -> dict[str, Any]:
    client = _client(base_url)
    _ensure_online(client)
    entries = client.search(query, path=path, glob=glob, limit=limit)
    return {
        "query": query,
        "count": len(entries),
        "entries": [
            {
                "path": e.path,
                "name": e.name,
                "kind": e.kind,
                "sizeBytes": e.size_bytes,
            }
            for e in entries
        ],
        "source": "files_api",
    }


def _collect_text_corpus(
    client: StorageFsClient,
    path: str,
    *,
    limit_files: int = 24,
    max_chars_each: int = 6_000,
) -> list[dict[str, str]]:
    entries = client.search("", path=path, glob=None, limit=200)
    files = [e for e in entries if e.kind == "file" and _is_indexable_path(e.path)]
    corpus: list[dict[str, str]] = []
    for entry in files[:limit_files]:
        try:
            text = _read_path_text(client, entry.path)
        except (StorageFsError, ValueError, OSError):
            continue
        text = (text or "").strip()
        if not text:
            continue
        corpus.append({"path": entry.path, "text": text[:max_chars_each]})
    return corpus


def files_summarize(
    path: str = "",
    *,
    base_url: str | None = None,
    limit: int = 8,
) -> dict[str, Any]:
    client = _client(base_url)
    _ensure_online(client)
    corpus = _collect_text_corpus(client, path)
    bullets: list[str] = []
    citations: list[dict[str, str]] = []
    for item in corpus:
        sentences = [s.strip() for s in split_sentences(item["text"]) if s.strip()]
        if not sentences:
            continue
        pick = sentences[0]
        if len(pick) > 220:
            pick = pick[:217] + "…"
        bullets.append(pick)
        citations.append({"path": item["path"], "excerpt": pick})
        if len(bullets) >= limit:
            break
    return {
        "path": path,
        "summary": "\n".join(f"- {b}" for b in bullets) if bullets else "",
        "bullets": bullets,
        "citations": citations,
        "fileCount": len(corpus),
        "source": "files_api",
    }


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:24]


def _load_index(client: StorageFsClient) -> dict[str, Any]:
    try:
        raw = client.read_json(INDEX_PATH)
        if isinstance(raw, dict) and raw.get("namespace") == INDEX_NAMESPACE:
            return raw
    except StorageFsError:
        pass
    return {
        "namespace": INDEX_NAMESPACE,
        "version": 1,
        "chunks": [],
        "files": {},
    }


def _save_index(client: StorageFsClient, index: dict[str, Any]) -> None:
    client.mkdir("scratch")
    client.write_json(INDEX_PATH, index, overwrite=True)


def files_index(
    path: str = "",
    *,
    base_url: str | None = None,
    limit_files: int = 40,
    force: bool = False,
) -> dict[str, Any]:
    """Build / refresh path-scoped embeddings for files/ (not document UUIDs)."""
    client = _client(base_url)
    _ensure_online(client)
    index = _load_index(client)
    existing_files: dict[str, Any] = dict(index.get("files") or {})
    existing_chunks: list[dict[str, Any]] = [
        c for c in (index.get("chunks") or []) if isinstance(c, dict)
    ]

    corpus = _collect_text_corpus(client, path, limit_files=limit_files, max_chars_each=12_000)
    updated = 0
    skipped = 0
    new_chunks: list[dict[str, Any]] = [
        c for c in existing_chunks if c.get("path") not in {item["path"] for item in corpus}
    ]

    for item in corpus:
        digest = _content_hash(item["text"])
        prev = existing_files.get(item["path"]) or {}
        if not force and prev.get("hash") == digest and prev.get("chunkCount"):
            # Keep previous chunks for this path
            kept = [c for c in existing_chunks if c.get("path") == item["path"]]
            new_chunks.extend(kept)
            skipped += 1
            continue
        pieces = chunk_text(item["text"], max_chunks=12)
        if not pieces:
            continue
        vectors = embed_batch(pieces)
        for idx, (snippet, vector) in enumerate(zip(pieces, vectors)):
            new_chunks.append(
                {
                    "id": f"{INDEX_NAMESPACE}:{item['path']}#{idx}",
                    "path": item["path"],
                    "chunkIndex": idx,
                    "snippet": snippet[:500],
                    "vector": vector,
                }
            )
        existing_files[item["path"]] = {
            "hash": digest,
            "chunkCount": len(pieces),
            "chars": len(item["text"]),
        }
        updated += 1

    # Drop files no longer present under scanned set when path is root-ish
    live_paths = {item["path"] for item in corpus}
    if not path:
        existing_files = {k: v for k, v in existing_files.items() if k in live_paths}
        new_chunks = [c for c in new_chunks if c.get("path") in live_paths]

    index = {
        "namespace": INDEX_NAMESPACE,
        "version": 1,
        "files": existing_files,
        "chunks": new_chunks,
        "count": len(new_chunks),
    }
    _save_index(client, index)
    return {
        "namespace": INDEX_NAMESPACE,
        "indexedFiles": len(existing_files),
        "chunkCount": len(new_chunks),
        "updated": updated,
        "skipped": skipped,
        "indexPath": INDEX_PATH,
        "source": "files_api",
    }


def _answer_from_index(
    question: str,
    *,
    path: str,
    limit: int,
    index: dict[str, Any],
) -> dict[str, Any] | None:
    chunks = [c for c in (index.get("chunks") or []) if isinstance(c, dict)]
    if path:
        prefix = path.strip("/")
        chunks = [
            c
            for c in chunks
            if str(c.get("path") or "") == prefix
            or str(c.get("path") or "").startswith(prefix + "/")
        ]
    if not chunks:
        return None
    query_vec = embed_text(question)
    scored: list[tuple[float, dict[str, Any]]] = []
    for chunk in chunks:
        vector = chunk.get("vector")
        if not isinstance(vector, list) or not vector:
            continue
        score = cosine_similarity(query_vec, vector)
        if score <= 0.05:
            continue
        scored.append((score, chunk))
    if not scored:
        return None
    scored.sort(key=lambda row: -row[0])
    top = scored[: max(1, min(limit, 12))]
    citations = [
        {
            "path": str(chunk.get("path") or ""),
            "excerpt": str(chunk.get("snippet") or "")[:280],
            "score": round(score, 4),
            "chunkIndex": chunk.get("chunkIndex"),
            "id": chunk.get("id"),
        }
        for score, chunk in top
    ]
    answer_lines = [c["excerpt"] for c in citations[:3] if c["excerpt"]]
    return {
        "question": question,
        "answer": "\n\n".join(answer_lines),
        "citations": citations,
        "source": "files_index",
        "namespace": INDEX_NAMESPACE,
        "retrieval": "embed",
    }


def files_answer(
    question: str,
    *,
    path: str = "",
    base_url: str | None = None,
    limit: int = 6,
    use_index: bool = True,
) -> dict[str, Any]:
    client = _client(base_url)
    _ensure_online(client)
    q = (question or "").strip()
    if not q:
        raise ValueError("question is required")

    if use_index:
        index = _load_index(client)
        if index.get("chunks"):
            semantic = _answer_from_index(q, path=path, limit=limit, index=index)
            if semantic and semantic.get("citations"):
                return semantic

    tokens = [t for t in re.split(r"\W+", q.lower()) if len(t) >= 3]
    corpus = _collect_text_corpus(client, path)
    scored: list[tuple[int, dict[str, str], str]] = []
    for item in corpus:
        lower = item["text"].lower()
        score = sum(lower.count(tok) for tok in tokens) if tokens else 1
        if score <= 0:
            continue
        sentence = ""
        for part in split_sentences(item["text"]):
            pl = part.lower()
            if any(tok in pl for tok in tokens):
                sentence = part.strip()
                break
        if not sentence:
            sentence = item["text"].strip().split("\n", 1)[0][:240]
        scored.append((score, item, sentence))
    scored.sort(key=lambda row: (-row[0], row[1]["path"]))
    top = scored[: max(1, min(limit, 12))]
    citations = [
        {"path": item["path"], "excerpt": excerpt, "score": score}
        for score, item, excerpt in top
    ]
    if not citations:
        return {
            "question": q,
            "answer": "No matching passages found in the files sandbox.",
            "citations": [],
            "source": "files_api",
            "retrieval": "extractive",
            "namespace": INDEX_NAMESPACE,
        }
    answer_lines = [c["excerpt"] for c in citations[:3]]
    return {
        "question": q,
        "answer": "\n\n".join(answer_lines),
        "citations": citations,
        "source": "files_api",
        "retrieval": "extractive",
        "namespace": INDEX_NAMESPACE,
    }
