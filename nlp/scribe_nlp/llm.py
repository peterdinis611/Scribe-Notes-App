"""Optional local LLM via Ollama HTTP API (stdlib only).

Default: disabled. No PyTorch. Calls localhost OpenAI-compatible chat.
Supports optional streaming via on_chunk callback (NDJSON from /api/chat).
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any
from urllib.parse import urlparse

DEFAULT_BASE_URL = "http://127.0.0.1:11434"
DEFAULT_TIMEOUT_S = 90.0
STATUS_TIMEOUT_S = 3.0
MAX_PROMPT_CHARS = 24_000

ChunkCallback = Callable[[str], None]


def normalize_base_url(raw: str | None) -> str:
    value = (raw or DEFAULT_BASE_URL).strip().rstrip("/")
    if not value:
        value = DEFAULT_BASE_URL
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("LLM base URL must be http(s)")
    host = (parsed.hostname or "").lower()
    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("LLM base URL must target localhost (privacy)")
    return value


def llm_status(
    *,
    base_url: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    """Ping Ollama `/api/tags`. Never raises — returns reachable=false on failure."""
    try:
        url = normalize_base_url(base_url)
    except ValueError as error:
        return {
            "reachable": False,
            "provider": "ollama",
            "baseUrl": (base_url or DEFAULT_BASE_URL).strip() or DEFAULT_BASE_URL,
            "model": (model or "").strip() or None,
            "models": [],
            "error": str(error),
        }

    try:
        payload = _http_json(f"{url}/api/tags", method="GET", timeout=STATUS_TIMEOUT_S)
    except Exception as error:  # noqa: BLE001 — status must stay soft
        return {
            "reachable": False,
            "provider": "ollama",
            "baseUrl": url,
            "model": (model or "").strip() or None,
            "models": [],
            "error": str(error),
        }

    models: list[str] = []
    for item in payload.get("models") or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or item.get("model") or "").strip()
        if name:
            models.append(name)

    preferred = (model or "").strip()
    if not preferred and models:
        preferred = models[0]

    return {
        "reachable": True,
        "provider": "ollama",
        "baseUrl": url,
        "model": preferred or None,
        "models": models,
        "error": None,
    }


def llm_complete(
    *,
    prompt: str,
    system: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 1024,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    stream: bool = False,
    on_chunk: ChunkCallback | None = None,
) -> dict[str, Any]:
    """Chat completion via Ollama `/api/chat`."""
    url = normalize_base_url(base_url)
    model_name = (model or "").strip()
    if not model_name:
        status = llm_status(base_url=url)
        model_name = str(status.get("model") or "").strip()
        if not model_name:
            raise RuntimeError(status.get("error") or "No Ollama model available")

    user_prompt = (prompt or "").strip()
    if not user_prompt:
        raise ValueError("prompt is empty")
    if len(user_prompt) > MAX_PROMPT_CHARS:
        user_prompt = user_prompt[:MAX_PROMPT_CHARS]

    messages: list[dict[str, str]] = []
    system_text = (system or "").strip()
    if system_text:
        messages.append({"role": "system", "content": system_text[:8_000]})
    messages.append({"role": "user", "content": user_prompt})

    body = {
        "model": model_name,
        "messages": messages,
        "stream": bool(stream and on_chunk is not None),
        "options": {
            "temperature": max(0.0, min(float(temperature), 1.5)),
            "num_predict": max(64, min(int(max_tokens), 4096)),
        },
    }

    if body["stream"]:
        text = _http_chat_stream(
            f"{url}/api/chat",
            body=body,
            timeout=timeout_s,
            on_chunk=on_chunk,
        )
    else:
        payload = _http_json(
            f"{url}/api/chat",
            method="POST",
            body=body,
            timeout=timeout_s,
        )
        message = payload.get("message") if isinstance(payload.get("message"), dict) else {}
        text = str(message.get("content") or payload.get("response") or "").strip()

    if not text:
        raise RuntimeError("Ollama returned an empty response")
    return {
        "text": text,
        "model": model_name,
        "provider": "ollama",
        "baseUrl": url,
        "streamed": bool(body["stream"]),
    }


def try_complete_from_options(
    llm_options: dict[str, Any] | None,
    *,
    prompt: str,
    system: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 1024,
    stream: bool = False,
    on_chunk: ChunkCallback | None = None,
) -> str | None:
    """Best-effort complete; returns None when options missing or call fails."""
    if not isinstance(llm_options, dict) or not llm_options:
        return None
    try:
        result = llm_complete(
            prompt=prompt,
            system=system,
            base_url=str(llm_options.get("baseUrl") or llm_options.get("base_url") or "") or None,
            model=str(llm_options.get("model") or "") or None,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=stream,
            on_chunk=on_chunk,
        )
        text = str(result.get("text") or "").strip()
        return text or None
    except Exception:
        return None


def _http_json(
    url: str,
    *,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    timeout: float = DEFAULT_TIMEOUT_S,
) -> dict[str, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"Ollama HTTP {error.code}: {detail or error.reason}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Ollama unreachable: {error.reason}") from error

    if not raw.strip():
        return {}
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise RuntimeError("Ollama returned non-object JSON")
    return parsed


def _http_chat_stream(
    url: str,
    *,
    body: dict[str, Any],
    timeout: float,
    on_chunk: ChunkCallback | None,
) -> str:
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method="POST",
    )
    parts: list[str] = []
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            while True:
                raw_line = response.readline()
                if not raw_line:
                    break
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(payload, dict):
                    continue
                message = payload.get("message") if isinstance(payload.get("message"), dict) else {}
                piece = str(message.get("content") or payload.get("response") or "")
                if piece:
                    parts.append(piece)
                    if on_chunk is not None:
                        on_chunk(piece)
                if payload.get("done") is True:
                    break
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"Ollama HTTP {error.code}: {detail or error.reason}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Ollama unreachable: {error.reason}") from error

    return "".join(parts).strip()
