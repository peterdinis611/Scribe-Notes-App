from __future__ import annotations

import json
import sys
from typing import Any

from . import __version__
from .embed import MODEL_ID, embed_batch, embed_text
from .ner import extract_entities
from .report import library_report
from .summarize import summarize_text


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
            }
        elif method == "embed":
            text = str(params.get("text") or "")
            vector = embed_text(text)
            result = {"vector": vector, "model": MODEL_ID, "dims": len(vector)}
        elif method == "embed_batch":
            texts = [str(item) for item in params.get("texts") or []]
            vectors = embed_batch(texts)
            dims = len(vectors[0]) if vectors else 0
            result = {"vectors": vectors, "model": MODEL_ID, "dims": dims}
        elif method == "summarize":
            text = str(params.get("text") or "")
            max_sentences = int(params.get("maxSentences") or 4)
            result = summarize_text(text, max_sentences=max_sentences)
        elif method == "extract_entities":
            text = str(params.get("text") or "")
            result = extract_entities(text)
        elif method == "library_report":
            documents = list(params.get("documents") or [])
            result = library_report(documents)
        else:
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32601, "message": f"Unknown method: {method}"},
            }

        return {"jsonrpc": "2.0", "id": request_id, "result": result}
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
        request = json.loads(line)
        response = handle_request(request)
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def main() -> None:
    run_stdio_server()
