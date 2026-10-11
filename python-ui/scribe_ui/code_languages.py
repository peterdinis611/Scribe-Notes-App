"""Pinned code language ids (`crates/scribe-ui` code_languages)."""

from __future__ import annotations

PINNED_LANGUAGE_IDS: tuple[str, ...] = (
    "plaintext",
    "javascript",
    "typescript",
    "python",
    "rust",
    "go",
    "bash",
    "json",
    "html",
    "css",
    "sql",
    "markdown",
    "yaml",
    "java",
    "kotlin",
    "swift",
    "c",
    "cpp",
    "csharp",
    "php",
    "ruby",
    "dockerfile",
    "xml",
    "scss",
    "graphql",
    "lua",
    "r",
    "dart",
    "scala",
    "powershell",
    "wasm",
)


def pinned_language_ids() -> list[str]:
    return list(PINNED_LANGUAGE_IDS)
