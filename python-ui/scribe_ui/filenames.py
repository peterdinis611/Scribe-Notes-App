"""Shared download / export filename sanitization."""

from __future__ import annotations


def sanitize_file_stem(name: str, max_len: int = 80) -> str:
    cleaned_chars: list[str] = []
    for c in name.strip():
        if c in '\\/:*?"<>|':
            cleaned_chars.append(" ")
        else:
            cleaned_chars.append(c)
    cleaned = " ".join("".join(cleaned_chars).split())
    limit = max(max_len, 1)
    truncated = cleaned[:limit].rstrip()
    return truncated if truncated else "scribe"


def sanitize_file_name(name: str, ext: str) -> str:
    stem = sanitize_file_stem(name, 80)
    ext = ext.strip().lstrip(".")
    return stem if not ext else f"{stem}.{ext}"
