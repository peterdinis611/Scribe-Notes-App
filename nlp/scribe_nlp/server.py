from __future__ import annotations

import json
import sys
from functools import lru_cache
from typing import Any

from . import __version__
from .config import (
    EMBED_CACHE_SIZE,
    MAX_EMBED_BATCH,
    MAX_REPORT_DOCUMENTS,
    MAX_TEXT_CHARS,
)
from .debug import nlp_debug_enabled
from .embed import embed_batch, embed_batch_with_chunks, embed_text, embed_with_chunks
from .embed_backend import (
    active_backend,
    configure_backend,
    current_model_id,
    quality_available,
    set_backend_change_hook,
    warmup_quality_model,
)
from .text_utils import truncate_text


class SidecarError(Exception):
    def __init__(self, message: str, code: int = -32000) -> None:
        super().__init__(message)
        self.code = code


@lru_cache(maxsize=EMBED_CACHE_SIZE)
def _cached_embed(text: str) -> tuple[float, ...]:
    return tuple(embed_text(text))


def _clear_embed_cache() -> None:
    _cached_embed.cache_clear()


set_backend_change_hook(_clear_embed_cache)


def _embed_cached(text: str) -> list[float]:
    return list(_cached_embed(truncate_text(text, MAX_TEXT_CHARS)))


def _validate_text(text: str, *, field: str = "text") -> str:
    if not isinstance(text, str):
        raise SidecarError(f"{field} must be a string")
    if len(text) > MAX_TEXT_CHARS:
        raise SidecarError(
            f"{field} exceeds {MAX_TEXT_CHARS} characters",
            code=-32602,
        )
    return text


def _validate_documents(params: dict[str, Any]) -> list[Any]:
    documents = list(params.get("documents") or [])
    if len(documents) > MAX_REPORT_DOCUMENTS:
        raise SidecarError(
            f"documents exceeds limit ({MAX_REPORT_DOCUMENTS})",
            code=-32602,
        )
    return documents


FEATURES = [
    "embed",
    "summarize",
    "ner",
    "report",
    "tasks",
    "keywords",
    "language",
    "outline",
    "similar",
    "analyze",
    "readability",
    "duplicates",
    "title",
    "mentions",
    "sentiment",
    "dates",
    "diff",
    "template",
    "chunking",
    "chunkEmbeddings",
    "queryRewrite",
    "stemming",
    "keybert",
    "spellcheck",
    "libraryAnswer",
    "dueHints",
]


def handle_request(request: dict[str, Any]) -> dict[str, Any]:
    from .debug import debug_log, nlp_debug_enabled, timed_debug

    request_id = request.get("id")
    method = request.get("method")
    params = request.get("params") or {}

    timer = timed_debug("rpc", method=method, id=request_id) if nlp_debug_enabled() else None
    if timer is not None:
        timer.__enter__()

    try:
        response = _handle_request_inner(request_id, method, params)
        if timer is not None:
            timer.__exit__(None, None, None)
        if nlp_debug_enabled() and "error" in response:
            debug_log("rpc:error-payload", method=method, error=response.get("error"))
        return response
    except Exception as error:  # noqa: BLE001
        if timer is not None:
            timer.__exit__(type(error), error, error.__traceback__)
        raise


def _handle_request_inner(
    request_id: Any,
    method: Any,
    params: dict[str, Any],
) -> dict[str, Any]:
    try:
        if method == "health":
            result = {
                "ok": True,
                "version": __version__,
                "model": current_model_id(),
                "embedBackend": active_backend(),
                "qualityAvailable": quality_available(),
                "features": FEATURES,
                "debug": nlp_debug_enabled(),
                "limits": {
                    "maxTextChars": MAX_TEXT_CHARS,
                    "maxEmbedBatch": MAX_EMBED_BATCH,
                    "maxReportDocuments": MAX_REPORT_DOCUMENTS,
                },
            }
        elif method == "set_embed_backend":
            backend = str(params.get("backend") or "hash")
            configured = configure_backend(backend)
            if configured == "quality":
                warmup_quality_model()
            result = {
                "embedBackend": configured,
                "model": current_model_id(),
                "qualityAvailable": quality_available(),
            }
        elif method == "embed":
            text = _validate_text(str(params.get("text") or ""))
            vector = _embed_cached(text)
            result = {"vector": vector, "model": current_model_id(), "dims": len(vector)}
        elif method == "embed_batch":
            raw_texts = params.get("texts") or []
            if not isinstance(raw_texts, list):
                raise SidecarError("texts must be an array", code=-32602)
            if len(raw_texts) > MAX_EMBED_BATCH:
                raise SidecarError(
                    f"texts exceeds batch limit ({MAX_EMBED_BATCH})",
                    code=-32602,
                )
            texts = [
                truncate_text(_validate_text(str(item), field="texts[]"), MAX_TEXT_CHARS)
                for item in raw_texts
            ]
            # Real MiniLM batch encode when quality is active (not N× single embeds).
            vectors = embed_batch(texts)
            dims = len(vectors[0]) if vectors else 0
            result = {"vectors": vectors, "model": current_model_id(), "dims": dims}
        elif method == "embed_with_chunks":
            text = _validate_text(str(params.get("text") or ""))
            result = embed_with_chunks(truncate_text(text, MAX_TEXT_CHARS))
        elif method == "embed_batch_with_chunks":
            raw_texts = params.get("texts") or []
            if not isinstance(raw_texts, list):
                raise SidecarError("texts must be an array", code=-32602)
            if len(raw_texts) > MAX_EMBED_BATCH:
                raise SidecarError(
                    f"texts exceeds batch limit ({MAX_EMBED_BATCH})",
                    code=-32602,
                )
            texts = [
                truncate_text(_validate_text(str(item), field="texts[]"), MAX_TEXT_CHARS)
                for item in raw_texts
            ]
            result = embed_batch_with_chunks(texts)
        elif method == "summarize":
            from .summarize import summarize_text

            text = _validate_text(str(params.get("text") or ""))
            max_sentences = max(1, min(int(params.get("maxSentences") or 4), 12))
            result = summarize_text(text, max_sentences=max_sentences)
        elif method == "extract_entities":
            from .ner import extract_entities

            result = extract_entities(_validate_text(str(params.get("text") or "")))
        elif method == "extract_tasks":
            from .tasks import extract_tasks

            result = extract_tasks(_validate_text(str(params.get("text") or "")))
        elif method == "extract_keywords":
            from .keybert_lite import keybert_keywords
            from .keywords import extract_keywords

            text = _validate_text(str(params.get("text") or ""))
            limit = max(1, min(int(params.get("limit") or 12), 32))
            quality_keywords = keybert_keywords(text, limit=limit)
            result = quality_keywords if quality_keywords is not None else extract_keywords(
                text, limit=limit
            )
        elif method == "detect_language":
            from .language import detect_language

            result = detect_language(_validate_text(str(params.get("text") or "")))
        elif method == "extract_outline":
            from .outline import extract_outline

            text = _validate_text(str(params.get("text") or ""))
            limit = max(1, min(int(params.get("limit") or 40), 80))
            result = extract_outline(text, limit=limit)
        elif method == "analyze_document":
            from .analyze import analyze_document

            text = _validate_text(str(params.get("text") or ""))
            result = analyze_document(
                text,
                keyword_limit=max(1, min(int(params.get("keywordLimit") or 12), 32)),
                outline_limit=max(1, min(int(params.get("outlineLimit") or 24), 80)),
                summary_sentences=max(1, min(int(params.get("summarySentences") or 3), 8)),
            )
        elif method == "similar_notes":
            from .similar import similar_notes

            query = _validate_text(str(params.get("text") or params.get("query") or ""))
            documents = _validate_documents(params)
            limit = max(1, min(int(params.get("limit") or 8), 32))
            result = similar_notes(query, documents, limit=limit)
        elif method == "library_report":
            from .report import library_report

            result = library_report(_validate_documents(params))
        elif method == "reading_stats":
            from .readability import reading_stats

            result = reading_stats(_validate_text(str(params.get("text") or "")))
        elif method == "find_duplicates":
            from .duplicates import find_duplicates

            documents = _validate_documents(params)
            limit = max(1, min(int(params.get("limit") or 20), 100))
            min_score = float(params.get("minScore") or 0.72)
            result = find_duplicates(documents, limit=limit, min_score=min_score)
        elif method == "suggest_title":
            from .title import suggest_title

            text = _validate_text(str(params.get("text") or ""))
            max_chars = max(16, min(int(params.get("maxChars") or 72), 120))
            result = suggest_title(text, max_chars=max_chars)
        elif method == "extract_mentions":
            from .mentions import extract_mentions

            result = extract_mentions(_validate_text(str(params.get("text") or "")))
        elif method == "analyze_sentiment":
            from .sentiment import analyze_sentiment

            result = analyze_sentiment(_validate_text(str(params.get("text") or "")))
        elif method == "extract_dates":
            from .dates import extract_dates

            result = extract_dates(_validate_text(str(params.get("text") or "")))
        elif method == "resolve_due_hints":
            from datetime import date as date_cls

            from .dates import resolve_due_hint

            raw_texts = params.get("texts") or []
            if not isinstance(raw_texts, list):
                raise SidecarError("texts must be an array", code=-32602)
            if len(raw_texts) > 200:
                raise SidecarError("texts exceeds limit (200)", code=-32602)
            today_raw = params.get("today")
            today = None
            if isinstance(today_raw, str) and today_raw.strip():
                try:
                    today = date_cls.fromisoformat(today_raw.strip()[:10])
                except ValueError as error:
                    raise SidecarError(f"Invalid today date: {error}", code=-32602) from error
            hints: list[str | None] = []
            for item in raw_texts:
                text = truncate_text(_validate_text(str(item), field="texts[]"), 4_000)
                hints.append(resolve_due_hint(text, today=today))
            result = {"hints": hints, "count": len(hints)}
        elif method == "library_answer":
            from .library_answer import library_answer

            question = _validate_text(
                str(params.get("question") or params.get("query") or ""),
                field="question",
            )
            passages = params.get("passages") or params.get("hits") or []
            if not isinstance(passages, list):
                raise SidecarError("passages must be an array", code=-32602)
            if len(passages) > 24:
                raise SidecarError("passages exceeds limit (24)", code=-32602)
            max_sentences = max(1, min(int(params.get("maxSentences") or 4), 8))
            result = library_answer(question, passages, max_sentences=max_sentences)
        elif method == "summarize_diff":
            from .diff_summary import summarize_diff

            old_text = _validate_text(str(params.get("oldText") or ""), field="oldText")
            new_text = _validate_text(str(params.get("newText") or ""), field="newText")
            max_bullets = max(1, min(int(params.get("maxBullets") or 5), 12))
            result = summarize_diff(old_text, new_text, max_bullets=max_bullets)
        elif method == "template_fill_hints":
            from .template_hints import template_fill_hints

            text = _validate_text(str(params.get("text") or ""))
            sections = params.get("expectedSections")
            expected = [str(item) for item in sections] if isinstance(sections, list) else None
            result = template_fill_hints(text, expected)
        elif method == "chunk_text":
            from .chunking import chunk_text

            text = _validate_text(str(params.get("text") or ""))
            chunks = chunk_text(
                text,
                max_chars=int(params.get("maxChars") or 1200),
                overlap=int(params.get("overlap") or 180),
                max_chunks=int(params.get("maxChunks") or 24),
            )
            result = {"chunks": chunks, "count": len(chunks)}
        elif method == "rewrite_query":
            from .query_rewrite import rewrite_query

            query = _validate_text(str(params.get("query") or params.get("text") or ""))
            max_expansions = max(0, min(int(params.get("maxExpansions") or 8), 16))
            result = rewrite_query(query, max_expansions=max_expansions)
        elif method == "spellcheck":
            from .spellcheck import spellcheck_text

            text = _validate_text(str(params.get("text") or ""))
            language = params.get("language")
            language_value = str(language).lower() if language else None
            max_issues = max(1, min(int(params.get("maxIssues") or 80), 200))
            result = spellcheck_text(text, language=language_value, max_issues=max_issues)
        else:
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32601, "message": f"Unknown method: {method}"},
            }

        return {"jsonrpc": "2.0", "id": request_id, "result": result}
    except SidecarError as error:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": error.code, "message": str(error)},
        }
    except Exception as error:  # noqa: BLE001
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": -32000, "message": str(error)},
        }


def run_stdio_server() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError as error:
            response = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": f"Parse error: {error}"},
            }
            sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
            sys.stdout.flush()
            continue

        if not isinstance(request, dict):
            response = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32600, "message": "Invalid request"},
            }
            sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
            sys.stdout.flush()
            continue

        response = handle_request(request)
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def main() -> None:
    run_stdio_server()
