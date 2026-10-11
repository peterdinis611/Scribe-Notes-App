"""Convention tags status:/project:/year: (`crates/scribe-ui` tag_meta)."""

from __future__ import annotations

from typing import TypedDict

STATUS_TAG_VALUES: tuple[str, ...] = ("draft", "review", "done", "archived")


class ParsedTag(TypedDict):
    raw: str
    kind: str
    value: str


class MetaFilters(TypedDict, total=False):
    status: str | None
    project: str | None
    year: str | None


def status_tag_values() -> list[str]:
    return list(STATUS_TAG_VALUES)


def parse_tag(raw: str) -> ParsedTag:
    trimmed = raw.strip()
    if ":" not in trimmed:
        return {"raw": trimmed, "kind": "plain", "value": trimmed}
    kind_raw, value_raw = trimmed.split(":", 1)
    kind = kind_raw.lower()
    if kind not in {"status", "project", "year"}:
        return {"raw": trimmed, "kind": "plain", "value": trimmed}
    return {"raw": trimmed, "kind": kind, "value": value_raw.strip()}


def make_meta_tag(kind: str, value: str) -> str:
    prefix = kind.strip().lower()
    if prefix == "plain":
        return value.strip()
    return f"{prefix}:{value.strip()}"


def document_matches_meta_filters(tags: list[str], filters: MetaFilters) -> bool:
    def has(needle: str) -> bool:
        return any(tag.lower() == needle.lower() for tag in tags)

    if status := filters.get("status"):
        if not has(make_meta_tag("status", status)):
            return False
    if project := filters.get("project"):
        if not has(make_meta_tag("project", project)):
            return False
    if year := filters.get("year"):
        if not has(make_meta_tag("year", year)):
            return False
    return True
