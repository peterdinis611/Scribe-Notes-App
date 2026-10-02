"""Local AI over Storage Files API (`files/` sandbox via loopback REST)."""

from __future__ import annotations

import re
from typing import Any

from .storage_fs import StorageFsClient, StorageFsError
from .text_utils import split_sentences

TEXT_EXTENSIONS = {".md", ".txt", ".json", ".csv", ".markdown", ".mdx"}
DEFAULT_BASE_URL = "http://127.0.0.1:8787"


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
                "textLike": e.kind == "file" and _is_text_path(e.path),
            }
            for e in entries
        ],
        "source": "files_api",
    }


def files_read_text(path: str, *, base_url: str | None = None) -> dict[str, Any]:
    client = _client(base_url)
    _ensure_online(client)
    if not _is_text_path(path):
        raise ValueError(f"NotAFile: unsupported text type for `{path}`")
    text = client.read_text(path)
    return {"path": path, "text": text, "sizeBytes": len(text.encode("utf-8")), "source": "files_api"}


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
    files = [e for e in entries if e.kind == "file" and _is_text_path(e.path)]
    corpus: list[dict[str, str]] = []
    for entry in files[:limit_files]:
        try:
            text = client.read_text(entry.path)
        except StorageFsError:
            continue
        text = text.strip()
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


def files_answer(
    question: str,
    *,
    path: str = "",
    base_url: str | None = None,
    limit: int = 6,
) -> dict[str, Any]:
    client = _client(base_url)
    _ensure_online(client)
    q = (question or "").strip()
    if not q:
        raise ValueError("question is required")
    tokens = [t for t in re.split(r"\W+", q.lower()) if len(t) >= 3]
    corpus = _collect_text_corpus(client, path)
    scored: list[tuple[int, dict[str, str], str]] = []
    for item in corpus:
        lower = item["text"].lower()
        score = sum(lower.count(tok) for tok in tokens) if tokens else 1
        if score <= 0:
            continue
        # Prefer a sentence containing a query token
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
    citations = [{"path": item["path"], "excerpt": excerpt, "score": score} for score, item, excerpt in top]
    if not citations:
        return {
            "question": q,
            "answer": "No matching passages found in the files sandbox.",
            "citations": [],
            "source": "files_api",
        }
    answer_lines = [c["excerpt"] for c in citations[:3]]
    return {
        "question": q,
        "answer": " ".join(answer_lines),
        "citations": citations,
        "source": "files_api",
    }
