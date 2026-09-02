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
from .embed import MODEL_ID, embed_batch, embed_text
from .ner import extract_entities
from .report import library_report
from .summarize import summarize_text
from .text_utils import truncate_text


class SidecarError(Exception):
    def __init__(self, message: str, code: int = -32000) -> None:
        super().__init__(message)
        self.code = code


@lru_cache(maxsize=EMBED_CACHE_SIZE)
def _cached_embed(text: str) -> tuple[float, ...]:
    return tuple(embed_text(text))


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


def handle_request(request: dict[str, Any]) -> dict[str, Any]:
    request_id = request.get("id")
    method = request.get("method")
    params = request.get("params") or {}

    try:
        if method == "health":
            result = {
                "ok": True,
                "version": __version__,
                "model": MODEL_ID,
                "features": ["embed", "summarize", "ner", "report"],
                "limits": {
                    "maxTextChars": MAX_TEXT_CHARS,
                    "maxEmbedBatch": MAX_EMBED_BATCH,
                    "maxReportDocuments": MAX_REPORT_DOCUMENTS,
                },
            }
        elif method == "embed":
            text = _validate_text(str(params.get("text") or ""))
            vector = _embed_cached(text)
            result = {"vector": vector, "model": MODEL_ID, "dims": len(vector)}
        elif method == "embed_batch":
            raw_texts = params.get("texts") or []
            if not isinstance(raw_texts, list):
                raise SidecarError("texts must be an array", code=-32602)
            if len(raw_texts) > MAX_EMBED_BATCH:
                raise SidecarError(
                    f"texts exceeds batch limit ({MAX_EMBED_BATCH})",
                    code=-32602,
                )
            texts = [_validate_text(str(item), field="texts[]") for item in raw_texts]
            vectors = [_embed_cached(text) for text in texts]
            dims = len(vectors[0]) if vectors else 0
            result = {"vectors": vectors, "model": MODEL_ID, "dims": dims}
        elif method == "summarize":
            text = _validate_text(str(params.get("text") or ""))
            max_sentences = int(params.get("maxSentences") or 4)
            max_sentences = max(1, min(max_sentences, 12))
            result = summarize_text(text, max_sentences=max_sentences)
        elif method == "extract_entities":
            text = _validate_text(str(params.get("text") or ""))
            result = extract_entities(text)
        elif method == "library_report":
            documents = list(params.get("documents") or [])
            if len(documents) > MAX_REPORT_DOCUMENTS:
                raise SidecarError(
                    f"documents exceeds limit ({MAX_REPORT_DOCUMENTS})",
                    code=-32602,
                )
            result = library_report(documents)
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
