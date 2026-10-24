"""Import programming / config source files as TipTap code blocks.

Mirrors Rust ``scribe_core::source_code``. Stdlib only.
"""

from __future__ import annotations

import base64
import json
import re
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


_FENCE_RE = re.compile(r"```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```", re.MULTILINE)
_TODO_RE = re.compile(r"(?i)\b(TODO|FIXME|HACK|XXX|NOTE)\b[:\s-]*(.+)$", re.MULTILINE)
_PY_DEF_RE = re.compile(r"^\s*(?:async\s+)?(?:def|class)\s+([A-Za-z_][\w]*)", re.MULTILINE)
_PY_IMPORT_RE = re.compile(
    r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))", re.MULTILINE
)
_RS_FN_RE = re.compile(
    r"^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:fn|struct|enum|trait|mod|type|impl)\s+([A-Za-z_][\w]*)",
    re.MULTILINE,
)
_RS_USE_RE = re.compile(r"^\s*(?:pub\s+)?use\s+([\w::{}\s,*]+);", re.MULTILINE)
_TS_FN_RE = re.compile(
    r"^\s*(?:export\s+)?(?:async\s+)?(?:function|class|const|type|interface|enum)\s+([A-Za-z_][\w]*)",
    re.MULTILINE,
)


def looks_like_code(text: str) -> bool:
    source = text or ""
    if "```" in source:
        return True
    lines = [ln for ln in source.splitlines() if ln.strip()]
    if len(lines) < 2:
        return False
    codeish = 0
    for line in lines[:80]:
        stripped = line.strip()
        if stripped.startswith(
            ("#include", "use ", "fn ", "def ", "class ", "import ", "package ", "fn(", "pub ")
        ):
            codeish += 2
        elif any(tok in stripped for tok in ("{", "};", "->", "::", "=>", ":=", "();")):
            codeish += 1
    return codeish >= 3


def _extract_code_payload(text: str, language: str | None) -> tuple[str, str | None]:
    """Prefer fenced blocks; else whole text. Returns (code, language)."""
    fences = list(_FENCE_RE.finditer(text or ""))
    if fences:
        # Prefer rust/python fences when present.
        preferred = ("rust", "rs", "python", "py", "typescript", "ts", "javascript", "js")
        for want in preferred:
            for match in fences:
                lang = (match.group(1) or "").strip().lower()
                if lang == want or (want in {"rs", "py", "ts", "js"} and lang.startswith(want)):
                    return match.group(2).strip("\n"), lang or language
        first = fences[0]
        return first.group(2).strip("\n"), (first.group(1) or "").strip().lower() or language
    return (text or "").strip(), language


def _unique(items: list[str], limit: int = 12) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = item.strip()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(key)
        if len(out) >= limit:
            break
    return out


def code_brief(
    text: str,
    *,
    language: str | None = None,
    path: str | None = None,
    llm: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Structure-focused brief for source (Python / Rust / TS and friends)."""
    source = (text or "").strip()
    if not source:
        raise CodeOpsError("text is required")

    lang = (language or "").strip().lower() or None
    if not lang and path:
        lang = language_from_path(path)
    code, lang = _extract_code_payload(source, lang)
    if not lang and looks_like_code(code):
        # Cheap fingerprint
        if "fn " in code or "pub struct" in code or "impl " in code:
            lang = "rust"
        elif "def " in code or "import " in code or "class " in code:
            lang = "python"
        elif "function " in code or "const " in code or "export " in code:
            lang = "typescript"

    symbols: list[str] = []
    imports: list[str] = []
    if lang in {"python", "py"}:
        symbols = _unique([m.group(1) for m in _PY_DEF_RE.finditer(code)])
        imports = _unique(
            [(m.group(1) or m.group(2) or "").strip() for m in _PY_IMPORT_RE.finditer(code)]
        )
        lang = "python"
    elif lang in {"rust", "rs"}:
        symbols = _unique([m.group(1) for m in _RS_FN_RE.finditer(code)])
        imports = _unique(
            [" ".join(m.group(1).split()) for m in _RS_USE_RE.finditer(code)], limit=10
        )
        lang = "rust"
    elif lang in {"typescript", "ts", "tsx", "javascript", "js", "jsx"}:
        symbols = _unique([m.group(1) for m in _TS_FN_RE.finditer(code)])
        lang = "typescript" if lang.startswith("ts") else "javascript"

    todos = _unique(
        [f"{m.group(1).upper()}: {m.group(2).strip()}" for m in _TODO_RE.finditer(code)],
        limit=8,
    )
    lines = [ln for ln in code.splitlines() if ln.strip()]
    line_count = len(lines)

    headline_bits: list[str] = []
    if lang:
        headline_bits.append(lang)
    headline_bits.append(f"{line_count} lines")
    if symbols:
        headline_bits.append(f"{len(symbols)} symbols")
    if imports:
        headline_bits.append(f"{len(imports)} imports")
    if todos:
        headline_bits.append(f"{len(todos)} TODO/FIXME")

    sections: list[str] = [f"**Code brief** ({', '.join(headline_bits)})"]
    if symbols:
        sections.append("**Symbols:** " + ", ".join(f"`{s}`" for s in symbols[:10]))
    if imports:
        sections.append("**Imports:** " + ", ".join(f"`{i}`" for i in imports[:8]))
    if todos:
        sections.append("**Open markers:**\n" + "\n".join(f"- {t}" for t in todos))
    if not symbols and not imports and not todos:
        preview = "\n".join(lines[:8])
        sections.append(f"```{lang or ''}\n{preview}\n```")

    answer = "\n\n".join(sections)
    enhanced = False
    try:
        from .llm import try_complete_from_options

        polished = try_complete_from_options(
            llm,
            prompt=(
                f"Briefly review this {lang or 'source'} code for a developer: "
                "purpose, main symbols, risks/TODOs. 4-8 short bullets.\n\n"
                f"{code[:5000]}"
            ),
            system="You review local code. Be concrete. No preamble.",
            max_tokens=420,
        )
        if polished:
            answer = polished
            enhanced = True
    except Exception:  # noqa: BLE001
        pass

    return {
        "ok": True,
        "language": lang,
        "lineCount": line_count,
        "symbols": symbols,
        "imports": imports,
        "todos": todos,
        "answer": answer,
        "brief": answer,
        "enhanced": enhanced,
        "source": "python",
    }
