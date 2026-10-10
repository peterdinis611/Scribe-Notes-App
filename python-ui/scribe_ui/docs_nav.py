"""In-app docs topic ids + groups (FE DocsView / Rust docs_nav)."""

from __future__ import annotations

from typing import TypedDict

DOCS_TOPIC_IDS: tuple[str, ...] = (
    "overview",
    "privacy",
    "documents",
    "library",
    "linkGraph",
    "wikiLinks",
    "editor",
    "search",
    "localAi",
    "revisions",
    "mcp",
    "plugins",
    "journal",
    "backup",
    "shortcuts",
)

DOCS_QUICK_LINKS: tuple[str, ...] = ("library", "localAi", "revisions", "plugins")


class DocsGroup(TypedDict):
    id: str
    topics: list[str]


def docs_topic_ids() -> list[str]:
    return list(DOCS_TOPIC_IDS)


def docs_quick_links() -> list[str]:
    return list(DOCS_QUICK_LINKS)


def docs_groups() -> list[DocsGroup]:
    return [
        {"id": "basics", "topics": ["overview", "privacy", "documents"]},
        {"id": "organize", "topics": ["library", "linkGraph", "wikiLinks"]},
        {
            "id": "write",
            "topics": ["editor", "search", "localAi", "revisions", "journal"],
        },
        {"id": "power", "topics": ["mcp", "plugins", "backup", "shortcuts"]},
    ]


def is_docs_topic(value: str) -> bool:
    return value in DOCS_TOPIC_IDS
