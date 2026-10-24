"""Local AI over Storage Files API (`files/` sandbox via loopback REST).

Includes extractive Q&A plus an optional path-scoped embedding index
(namespace separate from note document ids) persisted under
`scratch/.scribe-files-index.json`.

Extended: hybrid (embedding + BM25) retrieval with per-file diversity,
incremental indexing (mtime/size shortcut, pruning, dimension checks),
safer DOCX/PDF extraction, salient summaries, index status / clear /
similar-files helpers.
"""

from __future__ import annotations

import hashlib
import io
import math
import re
import threading
import time
import unicodedata
import zipfile
from collections import Counter
from typing import Any, Literal
from xml.etree import ElementTree as ET

from .embed import cosine_similarity, embed_batch, embed_text
from .embed_backend import current_model_id
from .chunking import chunk_text
from .faiss_search import faiss_available, faiss_top_k
from .storage_fs import StorageFsClient, StorageFsError
from .text_utils import split_sentences

TEXT_EXTENSIONS = {".md", ".txt", ".json", ".csv", ".markdown", ".mdx"}
# Programming / config sources — searchable by files_answer / index.
CODE_EXTENSIONS = {
    ".rs",
    ".py",
    ".pyw",
    ".pyi",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".go",
    ".java",
    ".kt",
    ".kts",
    ".swift",
    ".c",
    ".h",
    ".hh",
    ".hpp",
    ".cc",
    ".cpp",
    ".cxx",
    ".cs",
    ".rb",
    ".php",
    ".lua",
    ".r",
    ".sql",
    ".toml",
    ".yaml",
    ".yml",
    ".xml",
    ".css",
    ".scss",
    ".sh",
    ".bash",
    ".zsh",
    ".ps1",
    ".graphql",
    ".gql",
    ".proto",
    ".vue",
    ".svelte",
    ".dart",
    ".scala",
    ".ex",
    ".exs",
    ".hs",
    ".clj",
    ".zig",
    ".nim",
    ".nix",
    ".tf",
    ".sol",
    ".diff",
    ".patch",
    ".jsonc",
    ".jsonl",
    ".ini",
    ".cfg",
    ".env",
}
RICH_TEXT_EXTENSIONS = {".pdf", ".docx"}
INDEXABLE_EXTENSIONS = TEXT_EXTENSIONS | CODE_EXTENSIONS | RICH_TEXT_EXTENSIONS
DEFAULT_BASE_URL = "http://127.0.0.1:8787"
INDEX_PATH = "scratch/.scribe-files-index.json"
INDEX_NAMESPACE = "files"
INDEX_VERSION = 2

MAX_FILE_BYTES = 5_000_000        # refuse to read bigger files
MAX_DOCX_XML_BYTES = 30_000_000   # guard against zip bombs
PDF_MAX_PAGES = 40
SCAN_LIMIT_DEFAULT = 200
HYBRID_ALPHA = 0.7                # weight of the embedding score in hybrid mode
ANN_MIN_CHUNKS = 24               # use FAISS/HNSW when enough vectors

RetrievalMode = Literal["hybrid", "semantic", "lexical"]

_index_mem_lock = threading.Lock()
# base_url -> (updatedAt|None, index dict)
_index_memory: dict[str, tuple[Any, dict[str, Any]]] = {}
_dim_cache: tuple[str, int] | None = None


class FilesApiOfflineError(RuntimeError):
    def __init__(self, detail: str = "") -> None:
        message = "FilesApiOffline: Local Files API is not running"
        if detail:
            message = f"{message} ({detail})"
        super().__init__(message)


# --------------------------------------------------------------------------- #
# Client / path helpers
# --------------------------------------------------------------------------- #

def _client(base_url: str | None = None) -> StorageFsClient:
    return StorageFsClient((base_url or DEFAULT_BASE_URL).rstrip("/"))


def _ensure_online(client: StorageFsClient) -> dict[str, Any]:
    try:
        return client.health()
    except StorageFsError as exc:
        raise FilesApiOfflineError(str(exc)) from exc


def _norm_path(path: str) -> str:
    return (path or "").strip().strip("/")


def _in_scope(candidate: str, scope: str) -> bool:
    scope = _norm_path(scope)
    cand = candidate.strip("/")
    return not scope or cand == scope or cand.startswith(scope + "/")


def _is_text_path(path: str) -> bool:
    lower = path.lower()
    return any(lower.endswith(ext) for ext in TEXT_EXTENSIONS)


def _is_indexable_path(path: str) -> bool:
    lower = path.lower()
    return any(lower.endswith(ext) for ext in INDEXABLE_EXTENSIONS)


# --------------------------------------------------------------------------- #
# Text helpers (diacritics-insensitive tokens, BM25, clipping)
# --------------------------------------------------------------------------- #

_TOKEN_RE = re.compile(r"\w+")


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _tokens(text: str, min_len: int = 3) -> list[str]:
    return [t for t in _TOKEN_RE.findall(_fold(text)) if len(t) >= min_len]


def _clip(text: str, max_chars: int) -> str:
    text = " ".join(text.split())
    if len(text) <= max_chars:
        return text
    cut = text[: max_chars - 1]
    space = cut.rfind(" ")
    if space > max_chars * 0.6:
        cut = cut[:space]
    return cut.rstrip(" ,;:.-") + "…"


def _bm25(
    query_tokens: list[str],
    docs_tokens: list[list[str]],
    *,
    k1: float = 1.5,
    b: float = 0.75,
) -> list[float]:
    n = len(docs_tokens)
    if n == 0:
        return []
    avgdl = (sum(len(d) for d in docs_tokens) / n) or 1.0
    df: Counter[str] = Counter()
    for d in docs_tokens:
        df.update(set(d))
    unique_query = set(query_tokens)
    scores: list[float] = []
    for d in docs_tokens:
        tf = Counter(d)
        dl = len(d)
        s = 0.0
        for t in unique_query:
            f = tf.get(t, 0)
            if not f:
                continue
            idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
            s += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * dl / avgdl))
        scores.append(s)
    return scores


def _best_excerpt(text: str, q_tokens: list[str], max_chars: int = 280) -> str | None:
    """Sentence with the most query-token overlap, or None if nothing overlaps."""
    if not q_tokens:
        return None
    sentences = [s.strip() for s in split_sentences(text) if s.strip()]
    if not sentences:
        return None
    qset = set(q_tokens)
    overlaps = [len(qset & set(_tokens(s))) for s in sentences]
    best = max(range(len(sentences)), key=lambda i: (overlaps[i], -i))
    if overlaps[best] == 0:
        return None
    return _clip(sentences[best], max_chars)


# --------------------------------------------------------------------------- #
# Extraction
# --------------------------------------------------------------------------- #

_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _extract_docx_text(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        try:
            info = archive.getinfo("word/document.xml")
        except KeyError as exc:
            raise ValueError("NotAFile: invalid docx (missing document.xml)") from exc
        if info.file_size > MAX_DOCX_XML_BYTES:
            raise ValueError("NotAFile: docx document.xml too large")
        xml = archive.read(info)
    root = ET.fromstring(xml)
    paragraphs: list[str] = []
    # Runs inside one paragraph are joined without separator; paragraphs by newline.
    for para in root.iter(_W + "p"):
        buf: list[str] = []
        for node in para.iter():
            if node.tag == _W + "t" and node.text:
                buf.append(node.text)
            elif node.tag == _W + "tab":
                buf.append("\t")
            elif node.tag in (_W + "br", _W + "cr"):
                buf.append("\n")
        line = "".join(buf).strip()
        if line:
            paragraphs.append(line)
    return "\n".join(paragraphs).strip()


def _extract_pdf_text(data: bytes, *, max_pages: int = PDF_MAX_PAGES) -> str:
    # Optional deps — never required for core NLP.
    reasons: list[str] = []
    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(io.BytesIO(data))
        pages = [(page.extract_text() or "") for page in reader.pages[:max_pages]]
        text = "\n".join(pages).strip()
        if text:
            return text
        reasons.append("pypdf: no text layer (scanned PDF?)")
    except ImportError:
        reasons.append("pypdf not installed")
    except Exception as exc:  # noqa: BLE001
        reasons.append(f"pypdf: {exc}")
    try:
        from pdfminer.high_level import extract_text as pdfminer_extract  # type: ignore

        text = (pdfminer_extract(io.BytesIO(data), maxpages=max_pages) or "").strip()
        if text:
            return text
        reasons.append("pdfminer: no text layer")
    except ImportError:
        reasons.append("pdfminer.six not installed")
    except Exception as exc:  # noqa: BLE001
        reasons.append(f"pdfminer: {exc}")
    raise ValueError(
        "NotAFile: PDF text extract failed (" + "; ".join(reasons) + ") — "
        "install pypdf (pip install pypdf); binary media stays out of scope"
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


def _read_path_text(
    client: StorageFsClient,
    path: str,
    *,
    size_hint: int | None = None,
) -> str:
    if size_hint is not None and size_hint > MAX_FILE_BYTES:
        raise ValueError(f"NotAFile: `{path}` is larger than {MAX_FILE_BYTES} bytes")
    if _is_text_path(path):
        return client.read_text(path)
    data = client.read_bytes(path)
    if len(data) > MAX_FILE_BYTES:
        raise ValueError(f"NotAFile: `{path}` is larger than {MAX_FILE_BYTES} bytes")
    return extract_file_text(path, data)


# --------------------------------------------------------------------------- #
# Listing / reading / searching (original API)
# --------------------------------------------------------------------------- #

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


def _list_files(client: StorageFsClient, path: str, scan_limit: int) -> tuple[list[Any], bool]:
    """Indexable files under path, sorted by path. Second value: listing was truncated."""
    entries = client.search("", path=path, glob=None, limit=scan_limit)
    files = [
        e
        for e in entries
        if e.kind == "file"
        and _is_indexable_path(e.path)
        and e.path.strip("/") != INDEX_PATH  # never index the index itself
    ]
    files.sort(key=lambda e: e.path)
    return files, len(entries) >= scan_limit


def _collect_text_corpus(
    client: StorageFsClient,
    path: str,
    *,
    limit_files: int = 24,
    max_chars_each: int = 6_000,
    scan_limit: int = SCAN_LIMIT_DEFAULT,
) -> list[dict[str, str]]:
    files, _ = _list_files(client, path, scan_limit)
    corpus: list[dict[str, str]] = []
    for entry in files:
        if len(corpus) >= limit_files:  # unreadable files don't eat the budget
            break
        try:
            text = _read_path_text(client, entry.path, size_hint=entry.size_bytes)
        except (StorageFsError, ValueError, OSError):
            continue
        text = (text or "").strip()
        if not text:
            continue
        corpus.append({"path": entry.path, "text": text[:max_chars_each]})
    return corpus


# --------------------------------------------------------------------------- #
# Summarize
# --------------------------------------------------------------------------- #

def _salient_sentences(sentences: list[str], k: int) -> list[str]:
    """Pick k sentences sharing the most vocabulary with the rest (original order)."""
    doc_freq: Counter[str] = Counter()
    token_sets = [set(_tokens(s)) for s in sentences]
    for ts in token_sets:
        doc_freq.update(ts)
    scored: list[tuple[float, int]] = []
    for i, (s, ts) in enumerate(zip(sentences, token_sets)):
        if len(s) < 15 or not ts:
            continue
        score = sum(doc_freq[t] - 1 for t in ts) / math.sqrt(len(ts))
        if i == 0:
            score *= 1.15  # lead bias
        scored.append((score, i))
    scored.sort(key=lambda row: (-row[0], row[1]))
    keep = sorted(i for _, i in scored[:k])
    return [sentences[i] for i in keep]


def files_summarize(
    path: str = "",
    *,
    base_url: str | None = None,
    limit: int = 8,
    per_file: int = 1,
    strategy: Literal["lead", "salient"] = "lead",
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
        if strategy == "salient":
            picks = _salient_sentences(sentences, max(1, per_file)) or sentences[:1]
        else:
            picks = sentences[: max(1, per_file)]
        for pick in picks:
            pick = _clip(pick, 220)
            bullets.append(pick)
            citations.append({"path": item["path"], "excerpt": pick})
            if len(bullets) >= limit:
                break
        if len(bullets) >= limit:
            break
    return {
        "path": path,
        "summary": "\n".join(f"- {b}" for b in bullets) if bullets else "",
        "bullets": bullets,
        "citations": citations,
        "fileCount": len(corpus),
        "strategy": strategy,
        "source": "files_api",
    }


# --------------------------------------------------------------------------- #
# Index storage
# --------------------------------------------------------------------------- #

def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:24]


def _empty_index() -> dict[str, Any]:
    return {
        "namespace": INDEX_NAMESPACE,
        "version": INDEX_VERSION,
        "chunks": [],
        "files": {},
    }


def clear_files_index_memory() -> None:
    """Drop process-local index cache (embed backend change / tests)."""
    global _dim_cache
    with _index_mem_lock:
        _index_memory.clear()
    _dim_cache = None


def _embed_dim() -> int:
    """Cached embedding dimensionality for the active model."""
    global _dim_cache
    mid = current_model_id()
    if _dim_cache is not None and _dim_cache[0] == mid:
        return _dim_cache[1]
    dim = len(embed_text("dimension probe"))
    _dim_cache = (mid, dim)
    return dim


def _mem_key(client: StorageFsClient) -> str:
    return getattr(client, "base_url", None) or DEFAULT_BASE_URL


def _load_index(client: StorageFsClient) -> dict[str, Any]:
    key = _mem_key(client)
    with _index_mem_lock:
        cached = _index_memory.get(key)
    if cached is not None:
        return cached[1]

    raw: dict[str, Any] | None = None
    try:
        loaded = client.read_json(INDEX_PATH)
        if isinstance(loaded, dict) and loaded.get("namespace") == INDEX_NAMESPACE:
            raw = loaded
    except StorageFsError:
        pass
    index = raw if raw is not None else _empty_index()
    with _index_mem_lock:
        _index_memory[key] = (index.get("updatedAt"), index)
    return index


def _save_index(client: StorageFsClient, index: dict[str, Any]) -> None:
    client.mkdir("scratch")
    client.write_json(INDEX_PATH, index, overwrite=True)
    key = _mem_key(client)
    with _index_mem_lock:
        _index_memory[key] = (index.get("updatedAt"), index)


def _group_chunks(chunks: list[Any]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for c in chunks:
        if isinstance(c, dict) and c.get("path"):
            grouped.setdefault(str(c["path"]), []).append(c)
    for items in grouped.values():
        items.sort(key=lambda c: c.get("chunkIndex") or 0)
    return grouped


def _round_vector(vector: Any) -> list[float]:
    return [round(float(x), 5) for x in vector]  # smaller JSON, same ranking


def files_index(
    path: str = "",
    *,
    base_url: str | None = None,
    limit_files: int = 40,
    force: bool = False,
    max_chars: int = 12_000,
    max_chunks: int = 12,
    scan_limit: int = 1_000,
) -> dict[str, Any]:
    """Build / refresh path-scoped embeddings for files/ (not document UUIDs).

    Incremental: unchanged files (same mtime+size, or same content hash) are skipped;
    files that disappeared from the scanned scope are pruned.
    """
    client = _client(base_url)
    _ensure_online(client)
    index = _load_index(client)
    scope = _norm_path(path)

    dim = _embed_dim()
    if index.get("dim") not in (None, dim):  # embedding model changed -> rebuild all
        index = _empty_index()
        force = True

    files_meta: dict[str, dict[str, Any]] = {
        p: dict(m) for p, m in (index.get("files") or {}).items() if isinstance(m, dict)
    }
    by_path = _group_chunks(index.get("chunks") or [])

    entries, truncated = _list_files(client, path, scan_limit)
    live = {e.path for e in entries}
    updated = skipped = removed = 0
    errors: list[dict[str, str]] = []

    for entry in entries[:limit_files]:
        prev = files_meta.get(entry.path) or {}
        has_chunks = bool(prev.get("chunkCount")) and entry.path in by_path

        # Cheap shortcut: same mtime + size -> no read, no hash.
        if (
            not force
            and has_chunks
            and entry.modified_at is not None
            and prev.get("modifiedAt") == entry.modified_at
            and prev.get("sizeBytes") == entry.size_bytes
            and prev.get("maxChars") == max_chars
        ):
            skipped += 1
            continue

        try:
            text = _read_path_text(client, entry.path, size_hint=entry.size_bytes)
        except (StorageFsError, ValueError, OSError) as exc:
            errors.append({"path": entry.path, "error": str(exc)})
            continue
        text = (text or "").strip()[:max_chars]
        if not text:  # became empty -> drop stale chunks
            if files_meta.pop(entry.path, None) is not None:
                removed += 1
            by_path.pop(entry.path, None)
            continue

        digest = _content_hash(text)
        if not force and has_chunks and prev.get("hash") == digest:
            prev.update(modifiedAt=entry.modified_at, sizeBytes=entry.size_bytes, maxChars=max_chars)
            files_meta[entry.path] = prev
            skipped += 1
            continue

        pieces = chunk_text(text, max_chunks=max_chunks)
        if not pieces:
            continue
        vectors = embed_batch(pieces)
        if len(vectors) != len(pieces):
            raise ValueError("embed_batch returned a different number of vectors than chunks")
        by_path[entry.path] = [
            {
                "id": f"{INDEX_NAMESPACE}:{entry.path}#{idx}",
                "path": entry.path,
                "chunkIndex": idx,
                "snippet": snippet[:500],
                "vector": _round_vector(vector),
            }
            for idx, (snippet, vector) in enumerate(zip(pieces, vectors))
        ]
        files_meta[entry.path] = {
            "hash": digest,
            "chunkCount": len(pieces),
            "chars": len(text),
            "modifiedAt": entry.modified_at,
            "sizeBytes": entry.size_bytes,
            "maxChars": max_chars,
        }
        updated += 1

    # Prune deleted files inside the scanned scope (only if the listing was complete).
    if not truncated:
        for p in [p for p in files_meta if _in_scope(p, scope) and p not in live]:
            files_meta.pop(p, None)
            by_path.pop(p, None)
            removed += 1
    for p in [p for p in by_path if p not in files_meta]:
        by_path.pop(p)

    chunks = [c for p in sorted(by_path) for c in by_path[p]]
    index = {
        "namespace": INDEX_NAMESPACE,
        "version": INDEX_VERSION,
        "dim": dim,
        "updatedAt": int(time.time()),
        "files": files_meta,
        "chunks": chunks,
        "count": len(chunks),
    }
    _save_index(client, index)
    return {
        "namespace": INDEX_NAMESPACE,
        "indexedFiles": len(files_meta),
        "chunkCount": len(chunks),
        "updated": updated,
        "skipped": skipped,
        "removed": removed,
        "remaining": max(0, len(entries) - limit_files),  # files beyond limit_files
        "truncated": truncated,
        "errors": errors,
        "dim": dim,
        "indexPath": INDEX_PATH,
        "source": "files_api",
    }


def files_index_status(
    path: str = "",
    *,
    base_url: str | None = None,
    scan_limit: int = 1_000,
) -> dict[str, Any]:
    """Compare the stored index with what is on disk (no file reads, no embeddings)."""
    client = _client(base_url)
    _ensure_online(client)
    index = _load_index(client)
    scope = _norm_path(path)
    entries, truncated = _list_files(client, path, scan_limit)
    live = {e.path: e for e in entries}
    indexed = {
        p: m
        for p, m in (index.get("files") or {}).items()
        if isinstance(m, dict) and _in_scope(p, scope)
    }
    stale = sorted(
        p
        for p, m in indexed.items()
        if p in live
        and m.get("modifiedAt") is not None
        and (m.get("modifiedAt") != live[p].modified_at or m.get("sizeBytes") != live[p].size_bytes)
    )
    return {
        "namespace": INDEX_NAMESPACE,
        "indexedFiles": len(indexed),
        "chunkCount": sum(int(m.get("chunkCount") or 0) for m in indexed.values()),
        "unindexed": sorted(p for p in live if p not in indexed),
        "stale": stale,
        "missing": [] if truncated else sorted(p for p in indexed if p not in live),
        "truncated": truncated,
        "dim": index.get("dim"),
        "version": index.get("version"),
        "updatedAt": index.get("updatedAt"),
        "indexPath": INDEX_PATH,
        "source": "files_api",
    }


def files_index_clear(path: str = "", *, base_url: str | None = None) -> dict[str, Any]:
    """Remove index entries under path (everything when path is empty)."""
    client = _client(base_url)
    _ensure_online(client)
    index = _load_index(client)
    scope = _norm_path(path)
    files_meta = dict(index.get("files") or {})
    chunks = [c for c in (index.get("chunks") or []) if isinstance(c, dict)]
    keep_files = {p: m for p, m in files_meta.items() if not _in_scope(p, scope)}
    keep_chunks = [c for c in chunks if not _in_scope(str(c.get("path") or ""), scope)]
    index.update(
        version=INDEX_VERSION,
        files=keep_files,
        chunks=keep_chunks,
        count=len(keep_chunks),
        updatedAt=int(time.time()),
    )
    _save_index(client, index)
    return {
        "namespace": INDEX_NAMESPACE,
        "removedFiles": len(files_meta) - len(keep_files),
        "removedChunks": len(chunks) - len(keep_chunks),
        "indexedFiles": len(keep_files),
        "indexPath": INDEX_PATH,
        "source": "files_api",
    }


# --------------------------------------------------------------------------- #
# Similar files
# --------------------------------------------------------------------------- #

def _centroid(vectors: list[list[float]]) -> list[float]:
    usable = [v for v in vectors if v]
    if not usable:
        return []
    dim = len(usable[0])
    usable = [v for v in usable if len(v) == dim]
    acc = [0.0] * dim
    for v in usable:
        for i, x in enumerate(v):
            acc[i] += x
    return [x / len(usable) for x in acc]


def files_similar(
    path: str,
    *,
    scope: str = "",
    limit: int = 5,
    base_url: str | None = None,
) -> dict[str, Any]:
    """Files whose indexed content is closest to `path` (mean chunk embedding)."""
    client = _client(base_url)
    _ensure_online(client)
    index = _load_index(client)
    by_path = _group_chunks(index.get("chunks") or [])
    target = path.strip("/")
    if target not in by_path:
        raise ValueError(f"NotIndexed: `{path}` is not in the files index (run files_index first)")
    centroids = {
        p: _centroid([c.get("vector") or [] for c in chunks])
        for p, chunks in by_path.items()
        if _in_scope(p, scope)
    }
    base = _centroid([c.get("vector") or [] for c in by_path[target]])
    scored = [
        (cosine_similarity(base, vec), p)
        for p, vec in centroids.items()
        if p != target and vec and len(vec) == len(base)
    ]
    scored.sort(key=lambda row: (-row[0], row[1]))
    return {
        "path": path,
        "similar": [
            {"path": p, "score": round(score, 4)}
            for score, p in scored[: max(1, min(limit, 20))]
        ],
        "source": "files_index",
        "namespace": INDEX_NAMESPACE,
    }


# --------------------------------------------------------------------------- #
# Answering
# --------------------------------------------------------------------------- #

def _cosine_scores_for_chunks(
    query_vec: list[float],
    chunks: list[dict[str, Any]],
) -> list[float]:
    """Semantic scores: FAISS shortlist when large, else linear scan."""
    cos_scores = [0.0] * len(chunks)
    valid_idx: list[int] = []
    matrix: list[list[float]] = []
    for i, chunk in enumerate(chunks):
        vector = chunk.get("vector")
        if isinstance(vector, list) and len(vector) == len(query_vec):
            valid_idx.append(i)
            matrix.append(vector)

    if not matrix:
        return cos_scores

    use_ann = faiss_available() and len(matrix) >= ANN_MIN_CHUNKS
    if use_ann:
        # Shortlist; unscored vectors stay 0 (hybrid still lifts strong lexical hits).
        shortlist = min(len(matrix), max(48, len(matrix) // 4))
        for local_idx, score in faiss_top_k(query_vec, matrix, limit=shortlist):
            if 0 <= local_idx < len(valid_idx):
                cos_scores[valid_idx[local_idx]] = max(0.0, float(score))
        return cos_scores

    for i, vector in zip(valid_idx, matrix):
        cos_scores[i] = max(0.0, cosine_similarity(query_vec, vector))
    return cos_scores


def _answer_from_index(
    question: str,
    *,
    path: str,
    limit: int,
    index: dict[str, Any],
    mode: RetrievalMode = "hybrid",
    min_score: float = 0.05,
    per_file: int = 2,
) -> dict[str, Any] | None:
    scope = _norm_path(path)
    chunks = [
        c
        for c in (index.get("chunks") or [])
        if isinstance(c, dict) and _in_scope(str(c.get("path") or ""), scope)
    ]
    if not chunks:
        return None

    q_tokens = _tokens(question)
    query_vec = embed_text(question)
    cos_scores = _cosine_scores_for_chunks(query_vec, chunks)

    alpha = 1.0 if mode == "semantic" else HYBRID_ALPHA
    lex_scores = [0.0] * len(chunks)
    if alpha < 1.0 and q_tokens:
        raw = _bm25(q_tokens, [_tokens(str(c.get("snippet") or "")) for c in chunks])
        top_raw = max(raw) if raw else 0.0
        if top_raw > 0:
            lex_scores = [r / top_raw for r in raw]

    scored: list[tuple[float, float, float, dict[str, Any]]] = []
    for chunk, cos, lex in zip(chunks, cos_scores, lex_scores):
        combined = alpha * cos + (1 - alpha) * lex
        if combined >= min_score:
            scored.append((combined, cos, lex, chunk))
    if not scored:
        return None
    scored.sort(key=lambda row: (-row[0], str(row[3].get("id") or "")))

    top_n = max(1, min(limit, 12))
    taken: Counter[str] = Counter()
    picked: list[tuple[float, float, float, dict[str, Any]]] = []
    for row in scored:  # per-file cap keeps answers from coming from one document
        p = str(row[3].get("path") or "")
        if taken[p] >= max(1, per_file):
            continue
        taken[p] += 1
        picked.append(row)
        if len(picked) >= top_n:
            break

    citations = []
    for combined, cos, lex, chunk in picked:
        snippet = str(chunk.get("snippet") or "")
        citations.append(
            {
                "path": str(chunk.get("path") or ""),
                "excerpt": _best_excerpt(snippet, q_tokens) or _clip(snippet, 280),
                "score": round(combined, 4),
                "semantic": round(cos, 4),
                "lexical": round(lex, 4),
                "chunkIndex": chunk.get("chunkIndex"),
                "id": chunk.get("id"),
            }
        )
    answer_lines = [c["excerpt"] for c in citations[:3] if c["excerpt"]]
    return {
        "question": question,
        "answer": "\n\n".join(answer_lines),
        "citations": citations,
        "source": "files_index",
        "namespace": INDEX_NAMESPACE,
        "retrieval": "embed" if mode == "semantic" else "hybrid",
    }


def _answer_lexical(
    client: StorageFsClient,
    question: str,
    *,
    path: str,
    limit: int,
) -> dict[str, Any]:
    q_tokens = _tokens(question)
    corpus = _collect_text_corpus(client, path)
    if q_tokens:
        scores = _bm25(q_tokens, [_tokens(item["text"]) for item in corpus])
    else:
        scores = [1.0] * len(corpus)

    scored: list[tuple[float, dict[str, str], str]] = []
    for score, item in zip(scores, corpus):
        if score <= 0:
            continue
        excerpt = _best_excerpt(item["text"], q_tokens, 240) or _clip(
            item["text"].strip().split("\n", 1)[0], 240
        )
        scored.append((score, item, excerpt))
    scored.sort(key=lambda row: (-row[0], row[1]["path"]))
    top = scored[: max(1, min(limit, 12))]
    citations = [
        {"path": item["path"], "excerpt": excerpt, "score": round(score, 4)}
        for score, item, excerpt in top
    ]
    if not citations:
        return {
            "question": question,
            "answer": "No matching passages found in the files sandbox.",
            "citations": [],
            "source": "files_api",
            "retrieval": "extractive",
            "namespace": INDEX_NAMESPACE,
        }
    return {
        "question": question,
        "answer": "\n\n".join(c["excerpt"] for c in citations[:3]),
        "citations": citations,
        "source": "files_api",
        "retrieval": "extractive",
        "namespace": INDEX_NAMESPACE,
    }


def files_answer(
    question: str,
    *,
    path: str = "",
    base_url: str | None = None,
    limit: int = 6,
    use_index: bool = True,
    mode: RetrievalMode = "hybrid",
    min_score: float = 0.05,
    per_file: int = 2,
) -> dict[str, Any]:
    """Answer from the index (hybrid/semantic) and fall back to BM25 over live files.

    mode="lexical" (or use_index=False) skips the index entirely.
    """
    if mode not in ("hybrid", "semantic", "lexical"):
        raise ValueError(f"unknown mode: {mode!r}")
    client = _client(base_url)
    _ensure_online(client)
    q = (question or "").strip()
    if not q:
        raise ValueError("question is required")

    if use_index and mode != "lexical":
        index = _load_index(client)
        if index.get("chunks"):
            result = _answer_from_index(
                q, path=path, limit=limit, index=index,
                mode=mode, min_score=min_score, per_file=per_file,
            )
            if result and result.get("citations"):
                return result

    return _answer_lexical(client, q, path=path, limit=limit)