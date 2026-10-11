"""Bridge Local AI sidecar → ``scribe_ui.html`` chrome renderers."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Mapping, Sequence


def _ensure_python_ui_path() -> None:
    """Allow importing ``scribe_ui`` from the monorepo without a pip install."""
    root = Path(__file__).resolve().parents[2] / "python-ui"
    root_str = str(root)
    if root.is_dir() and root_str not in sys.path:
        sys.path.insert(0, root_str)


def render_ui_surface(
    surface: str,
    *,
    strings: Mapping[str, str] | None = None,
    version: str = "3.5.0",
    short_version: str | None = None,
    recent: Sequence[Mapping[str, Any]] | None = None,
    docs_topics: Sequence[Mapping[str, Any]] | None = None,
    docs_groups: Sequence[tuple[str, Sequence[str]]] | None = None,
    full_document: bool = True,
    fragment_only: bool = False,
) -> dict[str, Any]:
    _ensure_python_ui_path()
    try:
        from scribe_ui.html import SURFACE_IDS, render_surface
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "scribe_ui is not available — set PYTHONPATH=python-ui or pip install -e python-ui"
        ) from exc

    short = (short_version or "").strip() or None
    html = render_surface(
        surface,
        strings=strings,
        version=version,
        short_version=short,
        recent=recent,
        docs_topics=docs_topics,
        docs_groups_data=docs_groups,
        full_document=full_document and not fragment_only,
    )
    normalized = surface.strip().lower().replace("_", "-")
    if normalized in {"whatsnew", "whats-new"}:
        normalized = "whats-new"
    return {
        "surface": normalized,
        "html": html,
        "fullDocument": full_document and not fragment_only,
        "supportedSurfaces": list(SURFACE_IDS),
        "engine": "python-ui",
    }
