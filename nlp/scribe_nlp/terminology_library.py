"""Cross-note terminology consistency across a library corpus."""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from .terminology import _MULTIWORD_RE, _normalize_key
from .text_utils import content_tokens


def check_terminology_library(
    documents: list[dict[str, Any]],
    *,
    limit: int = 16,
) -> dict[str, Any]:
    """documents: [{id, title, text}, ...]"""
    limit = max(1, min(int(limit or 16), 40))
    # key -> variant -> {count, docs: set}
    groups: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    scanned = 0

    for doc in documents:
        doc_id = str(doc.get("id") or "")
        title = str(doc.get("title") or "")
        text = str(doc.get("text") or "")
        raw_terms: list[str] = []
        for match in _MULTIWORD_RE.finditer(f"{title}\n{text}"):
            term = match.group(1).strip()
            if len(term) >= 3:
                raw_terms.append(term)
        for token in content_tokens(text):
            if len(token) >= 6:
                raw_terms.append(token)
        scanned += len(raw_terms)
        for term in raw_terms:
            key = _normalize_key(term)
            if len(key) < 4:
                continue
            bucket = groups[key].setdefault(term, {"count": 0, "docs": set()})
            bucket["count"] += 1
            if doc_id:
                bucket["docs"].add(doc_id)

    issues: list[dict[str, Any]] = []
    for key, variants_map in groups.items():
        if len(variants_map) < 2:
            continue
        ranked = sorted(variants_map.items(), key=lambda item: item[1]["count"], reverse=True)
        preferred, preferred_meta = ranked[0]
        # Cross-doc signal: variants appear in different documents.
        doc_sets = [meta["docs"] for _, meta in ranked]
        cross = len(set().union(*doc_sets)) >= 2 if doc_sets else False
        if not cross and len(ranked) < 2:
            continue
        others = []
        for term, meta in ranked[1:6]:
            others.append(
                {
                    "term": term,
                    "count": meta["count"],
                    "documentIds": sorted(meta["docs"])[:8],
                }
            )
        issues.append(
            {
                "canonical": preferred,
                "key": key,
                "preferredCount": preferred_meta["count"],
                "preferredDocumentIds": sorted(preferred_meta["docs"])[:8],
                "variants": others,
                "crossDocument": cross,
                "suggestion": f"Prefer “{preferred}” across notes",
            }
        )

    issues.sort(
        key=lambda item: (1 if item["crossDocument"] else 0, len(item["variants"])),
        reverse=True,
    )
    return {
        "issues": issues[:limit],
        "issueCount": min(len(issues), limit),
        "scannedTerms": scanned,
        "documentCount": len(documents),
        "source": "python",
    }
