"""Import programming / config source files as TipTap code blocks.

Mirrors Rust ``scribe_core::source_code``. Stdlib only.
"""

from __future__ import annotations

import base64
import json
from typing import Any

MAX_SOURCE_BYTES = 2 * 1024 * 1024

_EXT_TO_LANG: dict[str, str] = {
    "js": "javascript",
    "mjs": "javascript",
    "cjs": "javascript",
    "jsx": "javascript",
    "ts": "typescript",
    "tsx": "typescript",
    "py": "python",
    "pyw": "python",
    "pyi": "python",
    "rs": "rust",
    "go": "go",
    "rb": "ruby",
    "php": "php",
    "java": "java",
    "kt": "kotlin",
    "kts": "kotlin",
    "swift": "swift",
    "c": "c",
    "h": "cpp",
    "hh": "cpp",
    "hpp": "cpp",
    "cc": "cpp",
    "cpp": "cpp",
    "cxx": "cpp",
    "cs": "csharp",
    "fs": "fsharp",
    "json": "json",
    "jsonc": "json",
    "jsonl": "json",
    "toml": "toml",
    "yml": "yaml",
    "yaml": "yaml",
    "xml": "xml",
    "css": "css",
    "scss": "scss",
    "sql": "sql",
    "sh": "bash",
    "bash": "bash",
    "zsh": "bash",
    "ps1": "powershell",
    "graphql": "graphql",
    "gql": "graphql",
    "proto": "protobuf",
    "vue": "vue",
    "svelte": "svelte",
    "dart": "dart",
    "lua": "lua",
    "r": "r",
    "zig": "zig",
    "nim": "nim",
    "nix": "nix",
    "tf": "terraform",
    "sol": "solidity",
    "diff": "diff",
    "patch": "diff",
}


class CodeOpsError(ValueError):
    """Invalid source payload."""


def language_from_extension(ext: str) -> str | None:
    key = ext.strip().lstrip(".").lower()
    return _EXT_TO_LANG.get(key)


def language_from_path(path: str) -> str | None:
    name = path.replace("\\", "/").rsplit("/", 1)[-1]
    lower = name.lower()
    if lower == "dockerfile" or lower.startswith("dockerfile."):
        return "dockerfile"
    if lower in {"makefile", "gnumakefile"}:
        return "makefile"
    if lower == "cmakelists.txt":
        return "cmake"
    if "." not in name:
        return None
    return language_from_extension(name.rsplit(".", 1)[-1])


def source_text_to_tiptap(code: str, language: str | None = None) -> dict[str, Any]:
    lang = (language or "").strip() or None
    content = [{"type": "text", "text": code}] if code else []
    return {
        "type": "doc",
        "content": [
            {
                "type": "codeBlock",
                "attrs": {"language": lang},
                "content": content,
            },
            {"type": "paragraph"},
        ],
    }


def _decode_text(params: dict[str, Any]) -> str:
    if isinstance(params.get("text"), str):
        return params["text"]
    raw: bytes | None = None
    if isinstance(params.get("bytes"), (bytes, bytearray)):
        raw = bytes(params["bytes"])
    elif isinstance(params.get("base64"), str) and params["base64"].strip():
        try:
            raw = base64.b64decode(params["base64"], validate=False)
        except Exception as exc:  # noqa: BLE001
            raise CodeOpsError(f"Invalid base64: {exc}") from exc
    elif isinstance(params.get("sourcePath"), str) and params["sourcePath"].strip():
        try:
            with open(params["sourcePath"].strip(), "rb") as handle:
                raw = handle.read(MAX_SOURCE_BYTES + 1)
        except OSError as exc:
            raise CodeOpsError(f"Cannot read path: {exc}") from exc
    if raw is None:
        raise CodeOpsError("Provide text, base64, bytes, or sourcePath")
    if len(raw) > MAX_SOURCE_BYTES:
        raise CodeOpsError(f"Source exceeds {MAX_SOURCE_BYTES} byte limit")
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    if b"\x00" in raw[: 8 * 1024]:
        raise CodeOpsError("File looks binary")
    return raw.decode("utf-8", errors="replace")


def source_to_tiptap(params: dict[str, Any]) -> dict[str, Any]:
    text = _decode_text(params)
    language = params.get("language")
    if not isinstance(language, str) or not language.strip():
        path = params.get("sourcePath") or params.get("path") or ""
        language = language_from_path(str(path)) if path else None
    if not language:
        language = "plaintext"
    doc = source_text_to_tiptap(text, str(language))
    return {
        "ok": True,
        "language": language,
        "contentJson": json.dumps(doc, ensure_ascii=False),
        "byteLength": len(text.encode("utf-8")),
    }


def inspect_source(params: dict[str, Any]) -> dict[str, Any]:
    path = str(params.get("sourcePath") or params.get("path") or "")
    language = params.get("language")
    if not isinstance(language, str) or not language.strip():
        language = language_from_path(path) if path else None
    text = None
    try:
        text = _decode_text(params)
    except CodeOpsError:
        pass
    return {
        "ok": True,
        "language": language,
        "supported": language is not None,
        "lineCount": len(text.splitlines()) if text is not None else None,
        "byteLength": len(text.encode("utf-8")) if text is not None else None,
    }
