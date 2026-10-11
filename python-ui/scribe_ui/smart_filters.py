"""Library smart-filter ids + match predicate (`crates/scribe-ui` smart_filters)."""

from __future__ import annotations

from typing import TypedDict

SMART_FILTER_IDS: tuple[str, ...] = ("none", "unlinked", "untagged", "unread")


class SmartFilterDoc(TypedDict, total=False):
    id: str
    tags: list[str]
    deletedAt: int | None


class SmartFilterOptions(TypedDict, total=False):
    orphanIds: list[str]
    recentDocumentIds: list[str]


def smart_filter_ids() -> list[str]:
    return list(SMART_FILTER_IDS)


def is_smart_filter_id(value: str) -> bool:
    return value in SMART_FILTER_IDS


def document_matches_smart_filter(
    doc: SmartFilterDoc,
    filter_id: str,
    options: SmartFilterOptions | None = None,
) -> bool:
    if filter_id == "none":
        return True
    if doc.get("deletedAt") is not None:
        return False
    opts = options or {}
    tags = doc.get("tags") or []
    doc_id = doc.get("id") or ""
    if filter_id == "untagged":
        return len(tags) == 0
    if filter_id == "unlinked":
        return doc_id in (opts.get("orphanIds") or [])
    if filter_id == "unread":
        return doc_id not in (opts.get("recentDocumentIds") or [])
    return False
