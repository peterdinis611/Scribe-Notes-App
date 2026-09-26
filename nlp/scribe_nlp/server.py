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
    fast_available,
    quality_available,
    set_backend_change_hook,
    warmup_fast_model,
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
    from .extras import fix_unicode

    if not isinstance(text, str):
        raise SidecarError(f"{field} must be a string")
    text = fix_unicode(text)
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
    "generatePlaceholder",
    "suggestContinuation",
    "libraryAnswer",
    "dueHints",
    "wikiSuggest",
    "organize",
    "calendarEvents",
    "answerFollowups",
    "rewriteSelection",
    "passageRerank",
]


def _active_features() -> list[str]:
    from .extras import extras_feature_flags

    return FEATURES + extras_feature_flags()


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
            from .extras import extras_status
            from .onnx_embed import onnx_available
            from .faiss_search import faiss_available, hnsw_available
            from .bm25_search import bm25_available
            from .spacy_ner import spacy_available
            from .argos_translate import argos_ready

            result = {
                "ok": True,
                "version": __version__,
                "model": current_model_id(),
                "embedBackend": active_backend(),
                "qualityAvailable": quality_available(),
                "fastAvailable": fast_available(),
                "onnxAvailable": onnx_available(),
                "faissAvailable": faiss_available(),
                "hnswAvailable": hnsw_available(),
                "bm25Available": bm25_available(),
                "spacyAvailable": spacy_available(),
                "argosAvailable": argos_ready(),
                "extras": extras_status(),
                "features": _active_features(),
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
            elif configured == "fast":
                warmup_fast_model()
            result = {
                "embedBackend": configured,
                "model": current_model_id(),
                "qualityAvailable": quality_available(),
                "fastAvailable": fast_available(),
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

            folders = params.get("folders") or []
            if not isinstance(folders, list):
                raise SidecarError("folders must be an array", code=-32602)
            if len(folders) > 500:
                raise SidecarError("folders exceeds limit (500)", code=-32602)
            result = library_report(_validate_documents(params), folders)
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
            scope = str(params.get("scope") or "library").strip().lower()
            if scope not in {"library", "document"}:
                scope = "library"
            # Document Q&A sends a wider pool; BM25 prunes before embed rerank.
            passage_limit = 96 if scope == "document" else 40
            if len(passages) > passage_limit:
                raise SidecarError(
                    f"passages exceeds limit ({passage_limit})",
                    code=-32602,
                )
            max_sentences = max(1, min(int(params.get("maxSentences") or 4), 8))
            answer_backend_raw = params.get("answerEmbedBackend") or params.get(
                "answer_embed_backend"
            )
            answer_embed_backend = None
            if isinstance(answer_backend_raw, str) and answer_backend_raw.strip():
                answer_embed_backend = answer_backend_raw.strip().lower()
                if answer_embed_backend not in {"hash", "fast", "quality"}:
                    answer_embed_backend = None
            result = library_answer(
                question,
                passages,
                max_sentences=max_sentences,
                scope=scope,
                answer_embed_backend=answer_embed_backend,
            )
        elif method == "suggest_wiki_links":
            from .wiki_suggest import suggest_wiki_links

            text = _validate_text(str(params.get("text") or ""))
            documents = _validate_documents(params)
            limit = max(1, min(int(params.get("limit") or 8), 12))
            exclude = params.get("excludeDocumentId") or params.get("documentId")
            exclude_id = str(exclude).strip() if exclude else None
            result = suggest_wiki_links(
                text,
                documents,
                limit=limit,
                exclude_document_id=exclude_id,
            )
        elif method == "suggest_organize":
            from .organize import suggest_organize

            text = _validate_text(str(params.get("text") or ""))
            folders = params.get("folders") or []
            if not isinstance(folders, list):
                raise SidecarError("folders must be an array", code=-32602)
            if len(folders) > 500:
                raise SidecarError("folders exceeds limit (500)", code=-32602)
            tags = params.get("tags") or []
            tag_list = [str(item) for item in tags] if isinstance(tags, list) else []
            current = params.get("currentFolderId")
            current_id = str(current).strip() if current else None
            limit = max(1, min(int(params.get("limit") or 3), 8))
            result = suggest_organize(
                text,
                folders,
                tags=tag_list,
                current_folder_id=current_id,
                limit=limit,
            )
        elif method == "extract_dates_batch":
            from datetime import date as date_cls

            from .dates import extract_dates_batch

            documents = _validate_documents(params)
            today_raw = params.get("today")
            today = None
            if isinstance(today_raw, str) and today_raw.strip():
                try:
                    today = date_cls.fromisoformat(today_raw.strip()[:10])
                except ValueError as error:
                    raise SidecarError(f"Invalid today date: {error}", code=-32602) from error
            limit_per_doc = max(1, min(int(params.get("limitPerDoc") or 12), 40))
            result = extract_dates_batch(
                documents,
                today=today,
                limit_per_doc=limit_per_doc,
            )
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
        elif method == "generate_placeholder":
            from .placeholder import generate_placeholder

            unit = str(params.get("unit") or "paragraphs")
            count = int(params.get("count") or 3)
            language = params.get("language")
            language_value = str(language) if language else "la"
            start_with_classic = bool(
                params.get("startWithClassic", params.get("startWithLorem", True))
            )
            seed = params.get("seed")
            seed_value = int(seed) if seed is not None else None
            result = generate_placeholder(
                unit=unit,
                count=count,
                language=language_value,
                start_with_classic=start_with_classic,
                seed=seed_value,
            )
        elif method == "rewrite_selection":
            from .rewrite import rewrite_selection

            text = _validate_text(str(params.get("text") or ""))
            mode = str(params.get("mode") or "rephrase_professional")
            custom_instruction = params.get("customInstruction")
            custom_value = str(custom_instruction) if custom_instruction else None
            result = rewrite_selection(text, mode=mode, custom_instruction=custom_value)
        elif method == "suggest_continuation":
            from .continuation import suggest_continuation

            prefix = str(params.get("prefix") or "")
            if len(prefix) > 8_000:
                raise SidecarError("prefix exceeds limit", code=-32602)
            corpus_raw = params.get("corpus") or []
            if not isinstance(corpus_raw, list):
                raise SidecarError("corpus must be an array of strings", code=-32602)
            corpus = [str(item) for item in corpus_raw[:80]]
            max_suggestions = max(1, min(int(params.get("maxSuggestions") or 3), 5))
            max_tokens = max(1, min(int(params.get("maxTokens") or 16), 32))
            result = suggest_continuation(
                prefix,
                corpus=corpus,
                max_suggestions=max_suggestions,
                max_tokens=max_tokens,
            )
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
