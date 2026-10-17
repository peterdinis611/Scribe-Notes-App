"""Library smart-filter ids + match predicates (`crates/scribe-ui` smart_filters).

Backward compatible with the original API; adds a registry, precomputed
context (O(1) lookups), extra filters, combining and bulk helpers.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable, Literal, Sequence, TypedDict

SmartFilterId = Literal[
    "none", "unlinked", "untagged", "unread", "canvas",
    "stubs", "tasks", "media",
    "linked", "tagged", "read", "trashed",
]

SMART_FILTER_IDS: tuple[str, ...] = (
    "none", "unlinked", "untagged", "unread", "canvas",
    "stubs", "tasks", "media",  # Rust / FE parity
    "linked", "tagged", "read", "trashed",
)


class SmartFilterDoc(TypedDict, total=False):
    id: str
    tags: list[str]
    deletedAt: int | None


class SmartFilterOptions(TypedDict, total=False):
    orphanIds: list[str]
    recentDocumentIds: list[str]
    canvasIds: list[str]
    stubIds: list[str]
    taskDocIds: list[str]
    mediaDocIds: list[str]


@dataclass(frozen=True)
class SmartFilterContext:
    """Option lists converted to frozensets once, so matching many docs is O(n)."""

    orphan_ids: frozenset[str] = frozenset()
    recent_ids: frozenset[str] = frozenset()
    canvas_ids: frozenset[str] = frozenset()
    stub_ids: frozenset[str] = frozenset()
    task_doc_ids: frozenset[str] = frozenset()
    media_doc_ids: frozenset[str] = frozenset()

    @classmethod
    def from_options(cls, options: SmartFilterOptions | None = None) -> "SmartFilterContext":
        o = options or {}
        return cls(
            orphan_ids=frozenset(o.get("orphanIds") or ()),
            recent_ids=frozenset(o.get("recentDocumentIds") or ()),
            canvas_ids=frozenset(o.get("canvasIds") or ()),
            stub_ids=frozenset(o.get("stubIds") or ()),
            task_doc_ids=frozenset(o.get("taskDocIds") or ()),
            media_doc_ids=frozenset(o.get("mediaDocIds") or ()),
        )


_Predicate = Callable[[SmartFilterDoc, SmartFilterContext], bool]
# id -> (predicate, applies_to_deleted_docs)
_REGISTRY: dict[str, tuple[_Predicate, bool]] = {}


def _register(filter_id: str, *, include_deleted: bool = False):
    def deco(fn: _Predicate) -> _Predicate:
        _REGISTRY[filter_id] = (fn, include_deleted)
        return fn

    return deco


def _id(doc: SmartFilterDoc) -> str:
    return doc.get("id") or ""


def _tags(doc: SmartFilterDoc) -> list[str]:
    return doc.get("tags") or []


@_register("none", include_deleted=True)
def _none(doc, ctx):
    return True


@_register("untagged")
def _untagged(doc, ctx):
    return not _tags(doc)


@_register("tagged")
def _tagged(doc, ctx):
    return bool(_tags(doc))


@_register("unlinked")
def _unlinked(doc, ctx):
    return _id(doc) in ctx.orphan_ids


@_register("linked")
def _linked(doc, ctx):
    return _id(doc) not in ctx.orphan_ids


@_register("unread")
def _unread(doc, ctx):
    return _id(doc) not in ctx.recent_ids


@_register("read")
def _read(doc, ctx):
    return _id(doc) in ctx.recent_ids


@_register("canvas")
def _canvas(doc, ctx):
    return _id(doc) in ctx.canvas_ids


@_register("stubs")
def _stubs(doc, ctx):
    return _id(doc) in ctx.stub_ids


@_register("tasks")
def _tasks(doc, ctx):
    return _id(doc) in ctx.task_doc_ids


@_register("media")
def _media(doc, ctx):
    return _id(doc) in ctx.media_doc_ids


@_register("trashed", include_deleted=True)
def _trashed(doc, ctx):
    return doc.get("deletedAt") is not None


assert set(_REGISTRY) == set(SMART_FILTER_IDS), "registry and SMART_FILTER_IDS out of sync"


def smart_filter_ids() -> list[str]:
    return list(SMART_FILTER_IDS)


def is_smart_filter_id(value: str) -> bool:
    return value in _REGISTRY


def _match(doc: SmartFilterDoc, filter_id: str, ctx: SmartFilterContext, strict: bool) -> bool:
    entry = _REGISTRY.get(filter_id)
    if entry is None:
        if strict:
            raise ValueError(f"unknown smart filter: {filter_id!r}")
        return False
    predicate, include_deleted = entry
    if not include_deleted and doc.get("deletedAt") is not None:
        return False
    return predicate(doc, ctx)


def document_matches_smart_filter(
    doc: SmartFilterDoc,
    filter_id: str,
    options: SmartFilterOptions | None = None,
    *,
    strict: bool = False,
) -> bool:
    """Original API. Unknown ids return False unless strict=True (raises ValueError)."""
    return _match(doc, filter_id, SmartFilterContext.from_options(options), strict)


def document_matches_smart_filters(
    doc: SmartFilterDoc,
    filter_ids: Iterable[str],
    options: SmartFilterOptions | None = None,
    *,
    mode: Literal["all", "any"] = "all",
    strict: bool = False,
) -> bool:
    """Combine filters: e.g. ['untagged', 'unlinked'] with mode='all' (AND)."""
    ctx = SmartFilterContext.from_options(options)
    results = (_match(doc, f, ctx, strict) for f in filter_ids)
    return all(results) if mode == "all" else any(results)


def filter_documents(
    docs: Iterable[SmartFilterDoc],
    filter_ids: str | Sequence[str],
    options: SmartFilterOptions | None = None,
    *,
    mode: Literal["all", "any"] = "all",
    strict: bool = False,
) -> list[SmartFilterDoc]:
    """Filter a whole list; the context is built once."""
    ids = [filter_ids] if isinstance(filter_ids, str) else list(filter_ids)
    ctx = SmartFilterContext.from_options(options)
    combine = all if mode == "all" else any
    return [d for d in docs if combine(_match(d, f, ctx, strict) for f in ids)]


def count_by_smart_filter(
    docs: Iterable[SmartFilterDoc],
    options: SmartFilterOptions | None = None,
) -> dict[str, int]:
    """Badge counts for a sidebar: {filter_id: number of matching docs}."""
    docs = list(docs)
    ctx = SmartFilterContext.from_options(options)
    return {f: sum(_match(d, f, ctx, False) for d in docs) for f in SMART_FILTER_IDS}


if __name__ == "__main__":
    docs: list[SmartFilterDoc] = [
        {"id": "a", "tags": []},
        {"id": "b", "tags": ["x"]},
        {"id": "c", "tags": [], "deletedAt": 123},
        {"id": "d", "tags": ["y"]},
    ]
    opts: SmartFilterOptions = {"orphanIds": ["a", "c"], "recentDocumentIds": ["b"], "canvasIds": ["d"]}

    assert document_matches_smart_filter(docs[2], "none")             # legacy: none matches everything
    assert not document_matches_smart_filter(docs[2], "untagged")     # deleted excluded
    assert [d["id"] for d in filter_documents(docs, "trashed")] == ["c"]
    assert [d["id"] for d in filter_documents(docs, ["untagged", "unlinked"], opts)] == ["a"]
    assert [d["id"] for d in filter_documents(docs, ["read", "canvas"], opts, mode="any")] == ["b", "d"]
    assert not document_matches_smart_filter(docs[0], "bogus")
    try:
        document_matches_smart_filter(docs[0], "bogus", strict=True)
        raise SystemExit("expected ValueError")
    except ValueError:
        pass
    print(count_by_smart_filter(docs, opts))