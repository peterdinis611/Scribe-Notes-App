from __future__ import annotations

import re

from .outline import extract_outline
from .text_utils import normalize_text

DEFAULT_SECTIONS = [
    "Cieľ",
    "Goal",
    "Kontext",
    "Context",
    "Next steps",
    "Ďalšie kroky",
    "Zhrnutie",
    "Summary",
]


def template_fill_hints(
    text: str,
    expected_sections: list[str] | None = None,
) -> dict[str, object]:
    """Report which template headings are present / missing in the note."""
    source = text or ""
    expected = [
        normalize_text(item)
        for item in (expected_sections or DEFAULT_SECTIONS)
        if normalize_text(str(item))
    ]
    # De-dupe while preserving order.
    seen_expected: set[str] = set()
    ordered: list[str] = []
    for item in expected:
        key = item.lower()
        if key in seen_expected:
            continue
        seen_expected.add(key)
        ordered.append(item)

    outline_titles = [
        str(item.get("title") or "")
        for item in (extract_outline(source, limit=80).get("items") or [])
    ]
    present: list[str] = []
    missing: list[str] = []

    for section in ordered:
        if _section_present(section, outline_titles, source):
            present.append(section)
        else:
            missing.append(section)

    coverage = (len(present) / len(ordered)) if ordered else 1.0
    return {
        "expected": ordered,
        "present": present,
        "missing": missing,
        "coverage": round(coverage, 3),
        "complete": len(missing) == 0,
    }


def _section_present(section: str, outline_titles: list[str], source: str) -> bool:
    needle = section.lower()
    for title in outline_titles:
        hay = title.lower()
        if needle == hay or needle in hay or hay in needle:
            return True
    # Also accept bold/markdown-ish inline headings.
    pattern = re.compile(rf"(?im)^(?:#{{1,6}}\s+|\*\*|__)?\s*{re.escape(section)}\b")
    return bool(pattern.search(source))
