"""Orphan → link target suggestions (mirrors ``crates/scribe-ui/src/orphan_links.rs``)."""

from __future__ import annotations

from typing import Any, Mapping, Sequence


def suggest_orphan_links(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        orphan_id = str(row.get("id") or "")
        orphan_title = str(row.get("title") or "")
        similar = row.get("similar") or []
        if not isinstance(similar, list):
            continue
        for hit in similar:
            if not isinstance(hit, Mapping):
                continue
            target_id = str(hit.get("documentId") or hit.get("document_id") or "")
            if not target_id or target_id == orphan_id:
                continue
            target_title = str(hit.get("title") or "") or "Note"
            rank = hit.get("rank")
            out.append(
                {
                    "orphanId": orphan_id,
                    "orphanTitle": orphan_title,
                    "targetId": target_id,
                    "targetTitle": target_title,
                    "rank": rank,
                }
            )
            break
    return out
