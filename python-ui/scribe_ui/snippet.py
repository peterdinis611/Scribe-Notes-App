"""FTS snippet sanitization for search UI."""

from __future__ import annotations

import re

_TAG_RE = re.compile(r"<(?!/?mark>)[^>]+>", re.IGNORECASE)


def sanitize_snippet(html: str) -> str:
    """Strip FTS snippet HTML except ``<mark>`` / ``</mark>`` highlight tags."""
    return _TAG_RE.sub("", html)
